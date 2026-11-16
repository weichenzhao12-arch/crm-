import { createHash, randomUUID } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function openLocalDatabase(root: string, file = resolve(root, '.local-data/crm.sqlite')) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  try {
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
    if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
    db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL); CREATE TABLE IF NOT EXISTS local_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);')
    const directory = resolve(root, 'migrations')
    for (const name of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
      const sql = readFileSync(resolve(directory, name), 'utf8')
      const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex')
      db.exec('BEGIN IMMEDIATE')
      try {
        const applied = db.prepare('SELECT checksum FROM local_migrations WHERE name = ?').get(name)
        if (applied && applied.checksum !== checksum) throw new Error(`已执行迁移被修改：${name}`)
        if (!applied) {
          db.exec(sql)
          db.prepare('INSERT INTO local_migrations VALUES (?, ?)').run(name, checksum)
        }
        db.exec('COMMIT')
      }
      catch (error) { db.exec('ROLLBACK'); throw error }
    }
    return db
  }
  catch (error) { db.close(); throw error }
}

export function seedLocalOnce(db: DatabaseSync, key: string, seed: () => void) {
  db.exec('BEGIN IMMEDIATE')
  try {
    if (!db.prepare('SELECT 1 FROM local_settings WHERE key = ?').get(key)) {
      seed()
      db.prepare('INSERT INTO local_settings VALUES (?, ?)').run(key, 'done')
    }
    db.exec('COMMIT')
  }
  catch (error) { db.exec('ROLLBACK'); throw error }
}

export function backupLocalDatabase(db: DatabaseSync, destination: string) {
  mkdirSync(dirname(destination), { recursive: true })
  const temporary = `${destination}.${randomUUID()}.partial`
  function verify(file: string) {
    const copy = new DatabaseSync(file, { readOnly: true })
    try {
      const check = copy.prepare('PRAGMA integrity_check').get()
      if (check?.integrity_check !== 'ok') throw new Error('备份完整性校验失败')
    }
    finally { copy.close() }
  }
  try {
    // Publish only an integrity-checked snapshot; concurrent starters cannot overwrite it.
    db.prepare('VACUUM INTO ?').run(temporary)
    verify(temporary)
    try { linkSync(temporary, destination) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      verify(destination)
    }
  }
  finally { if (existsSync(temporary)) unlinkSync(temporary) }
}
