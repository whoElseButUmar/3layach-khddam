import app from '@tanstack/react-start/server-entry'

export { BoardRoom } from '#/server/board-room'

const REALTIME_ROUTE = /^\/api\/boards\/([A-Z]{6})\/realtime$/

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    const url = new URL(request.url)
    const match = REALTIME_ROUTE.exec(url.pathname)

    if (match && request.headers.get('Upgrade') === 'websocket') {
      const boardCode = match[1]
      const roomId = env.BOARD_ROOM.idFromName(boardCode)
      const room = env.BOARD_ROOM.get(roomId)

      return room.fetch(request)
    }

    return app.fetch(request, env, ctx)
  },
}
