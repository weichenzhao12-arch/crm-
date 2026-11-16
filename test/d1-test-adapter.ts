import type { DatabaseSync, SQLInputValue } from 'node:sqlite'

export function d1Adapter(db: DatabaseSync, beforeBatch?: (sql: string[]) => void) {
  function prepare(sql: string) {
    const statement = db.prepare(sql)
    let args: SQLInputValue[] = []
    return {
      sql,
      bind(...values: SQLInputValue[]) { args = values; return this },
      async first() { return statement.get(...args) ?? null },
      async all() { return { results: statement.all(...args) } },
      execute() {
        if (statement.columns().length) return { results: statement.all(...args), meta: { changes: 0 } }
        return { results: [], meta: { changes: Number(statement.run(...args).changes) } }
      },
      async run() { return this.execute() },
    }
  }
  return {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      beforeBatch?.(statements.map(statement => statement.sql))
      db.exec('BEGIN IMMEDIATE')
      try {
        const results = statements.map(statement => statement.execute())
        db.exec('COMMIT')
        return results
      }
      catch (error) { db.exec('ROLLBACK'); throw error }
    },
  } as unknown as D1Database
}
