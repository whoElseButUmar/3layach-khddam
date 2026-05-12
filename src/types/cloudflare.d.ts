type D1ResultMeta = {
  changes: number
}

type D1Result = {
  success: boolean
  meta: D1ResultMeta
}

type D1ResultSet<T> = {
  results?: Array<T>
  success: boolean
  meta: D1ResultMeta
}

interface D1PreparedStatement {
  bind: (...values: Array<string | number | null>) => D1PreparedStatement
  first: <T = unknown>() => Promise<T | null>
  all: <T = unknown>() => Promise<D1ResultSet<T>>
  run: () => Promise<D1Result>
}

interface D1Database {
  prepare: (query: string) => D1PreparedStatement
  exec: (query: string) => Promise<D1Result>
}

interface DurableObjectId {}

interface DurableObjectStub {
  fetch: (request: Request | string, init?: RequestInit) => Promise<Response>
}

interface DurableObjectNamespace {
  idFromName: (name: string) => DurableObjectId
  get: (id: DurableObjectId) => DurableObjectStub
}

interface DurableObjectState {
  acceptWebSocket: (socket: WebSocket) => void
  getWebSockets: () => Array<WebSocket>
}

interface WebSocketPair {
  0: WebSocket
  1: WebSocket
}

interface WebSocketPairConstructor {
  new (): WebSocketPair
}

declare const WebSocketPair: WebSocketPairConstructor

interface ExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void
  passThroughOnException: () => void
}

interface CloudflareEnv {
  BOARD_DB?: D1Database
  BOARD_ROOM: DurableObjectNamespace
}

declare module 'cloudflare:workers' {
  export class DurableObject<TEnv = CloudflareEnv> {
    protected ctx: DurableObjectState
    protected env: TEnv
    constructor(ctx: DurableObjectState, env: TEnv)
  }

  export const env: {
    BOARD_DB?: D1Database
    BOARD_ROOM?: DurableObjectNamespace
  }
}
