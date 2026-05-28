interface D1Database {
  exec(query: string): Promise<unknown>
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  run(): Promise<unknown>
}

interface R2Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<R2ObjectBody | null>
}

interface R2ObjectBody {
  body: ReadableStream
  writeHttpMetadata(headers: Headers): void
}
