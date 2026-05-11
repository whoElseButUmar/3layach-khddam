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

declare module 'cloudflare:workers' {
  export const env: {
    BOARD_DB?: D1Database
  }
}
