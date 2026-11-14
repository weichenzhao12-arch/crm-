import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'
import type { Plugin } from 'vite'
import { onRequest } from '../functions/[[path]]'
import { localWarehouse } from './local-warehouse'

export function localCrm(): Plugin {
  return {
    name: 'local-crm',
    apply: 'serve',
    configureServer(server) {
      const db = new DatabaseSync(':memory:')
      const migrations = resolve(server.config.root, 'migrations')
      for (const file of readdirSync(migrations).sort())
        db.exec(readFileSync(resolve(migrations, file), 'utf8'))
      db.prepare('INSERT INTO users (id,account,display_name,role,password,permissions) VALUES (?,?,?,?,?,?)')
        .run('clerk', 'clerk', '销售文员', 'clerk', '123456', '{"assignUnclaimedCustomers":true}')
      db.prepare('INSERT INTO users (id,account,display_name,role,password,permissions) VALUES (?,?,?,?,?,?)')
        .run('warehouse', 'warehouse', '仓库演示员', 'viewer', '123456', '{"warehouseStock":true,"warehouseShip":true,"warehousePrint":true}')
      const insert = db.prepare('INSERT INTO crm_customers (id,name,assigned_to_user_id,value) VALUES (?,?,?,?)')
      for (const [id, name, owner] of [['lead-a', '演示客户甲', 'sales-1'], ['lead-b', '演示客户乙', 'sales-2'], ['lead-c', '待分配线索', null]] as const)
        insert.run(id, name, owner, JSON.stringify({ id, name, assignedToUserId: owner, followUps: [] }))
      function prepare(sql: string) {
        const statement = db.prepare(sql)
        let args: SQLInputValue[] = []
        return {
          bind(...values: SQLInputValue[]) { args = values; return this },
          first: async () => statement.get(...args) ?? null,
          all: async () => ({ results: statement.all(...args) }),
          execute: () => ({ meta: { changes: Number(statement.run(...args).changes) } }),
          async run() { return this.execute() },
        }
      }
      const DB = {
        prepare,
        async batch(statements: ReturnType<typeof prepare>[]) {
          db.exec('BEGIN')
          try {
            const results = statements.map(statement => statement.execute())
            db.exec('COMMIT')
            return results
          }
          catch (error) {
            db.exec('ROLLBACK')
            throw error
          }
        },
      }
      server.httpServer?.once('close', () => db.close())
      server.middlewares.use('/api/local-warehouse', localWarehouse(db))
      for (const prefix of ['/api', '/local-crm-api']) server.middlewares.use(prefix, async (req, res) => {
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req)
            chunks.push(Buffer.from(chunk))
          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers))
            if (typeof value === 'string') headers.set(key, value)
          const response = await onRequest({
            request: new Request(new URL('/api' + req.url, 'http://127.0.0.1'), {
              method: req.method, headers, body: chunks.length ? Buffer.concat(chunks).toString() : undefined,
            }),
            env: { DB, CUSTOMER_ROW_API: prefix === '/local-crm-api' ? 'enabled' : undefined },
            data: {}, functionPath: '/api', waitUntil() {}, passThroughOnException() {},
          }) as Response
          res.writeHead(response.status, Object.fromEntries(response.headers))
          res.end(Buffer.from(await response.arrayBuffer()))
        }
        catch (error) {
          server.config.logger.error(String(error))
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: '本地测试接口错误' }))
        }
      })
    },
  }
}
