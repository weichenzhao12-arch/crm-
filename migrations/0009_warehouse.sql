CREATE TABLE IF NOT EXISTS warehouse_stock (id TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS warehouse_orders (id TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS warehouse_log (
  event TEXT NOT NULL, actor TEXT NOT NULL, target TEXT NOT NULL,
  detail TEXT NOT NULL, time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS warehouse_requests (
  actor TEXT NOT NULL, request_key TEXT NOT NULL, operation TEXT NOT NULL,
  request_hash TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (actor, request_key)
);
CREATE INDEX IF NOT EXISTS warehouse_log_target_time ON warehouse_log(target, time);
