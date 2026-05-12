import { DurableObject } from 'cloudflare:workers'

import type { BoardNote } from '#/types/board'

type RealtimeEvent =
  | {
      type: 'note:draft'
      note: BoardNote
      sourceClientId: string
    }
  | {
      type: 'note:upserted'
      note: BoardNote
      sourceClientId?: string
    }
  | {
      type: 'note:deleted'
      boardCode: string
      noteId: string
      sourceClientId?: string
    }
  | {
      type: 'presence'
      connections: number
    }

type ResponseInitWithWebSocket = ResponseInit & {
  webSocket: WebSocket
}

export class BoardRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.connectWebSocket()
    }

    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      const event = (await request.json()) as RealtimeEvent
      this.broadcast(event)

      return Response.json({ ok: true })
    }

    return new Response('Not found', { status: 404 })
  }

  async webSocketMessage(
    socket: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message !== 'string' || message.length > 10_000) {
      return
    }

    const event = parseRealtimeEvent(message)

    if (!event) {
      return
    }

    this.broadcast(event, socket)
  }

  async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    socket.close(code, reason)
    this.broadcastPresence()
  }

  private connectWebSocket() {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket]

    this.ctx.acceptWebSocket(server)
    this.broadcastPresence()

    return new Response(null, {
      status: 101,
      webSocket: client,
    } satisfies ResponseInitWithWebSocket)
  }

  private broadcast(event: RealtimeEvent, exclude?: WebSocket) {
    const payload = JSON.stringify({
      ...event,
      sentAt: new Date().toISOString(),
    })

    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== exclude) {
        socket.send(payload)
      }
    }
  }

  private broadcastPresence() {
    this.broadcast({
      type: 'presence',
      connections: this.ctx.getWebSockets().length,
    })
  }
}

function parseRealtimeEvent(message: string): RealtimeEvent | null {
  try {
    const event = JSON.parse(message) as RealtimeEvent

    if (event.type === 'note:draft' && isBoardNote(event.note)) {
      return event
    }

    if (
      event.type === 'note:deleted' &&
      /^[A-Z]{6}$/.test(event.boardCode) &&
      typeof event.noteId === 'string'
    ) {
      return event
    }
  } catch {
    return null
  }

  return null
}

function isBoardNote(note: BoardNote | undefined): note is BoardNote {
  return Boolean(
    note &&
    typeof note.id === 'string' &&
    /^[A-Z]{6}$/.test(note.boardCode) &&
    typeof note.content === 'string' &&
    typeof note.x === 'number' &&
    typeof note.y === 'number' &&
    typeof note.width === 'number' &&
    typeof note.height === 'number',
  )
}
