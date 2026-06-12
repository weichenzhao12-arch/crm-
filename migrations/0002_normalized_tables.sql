CREATE TABLE IF NOT EXISTS crm_customers (
  id TEXT PRIMARY KEY,
  name TEXT,
  owner TEXT,
  stage TEXT,
  assigned_to_user_id TEXT,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quote_products (
  id TEXT PRIMARY KEY,
  item_no TEXT,
  category TEXT,
  model TEXT,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quote_materials (
  id TEXT PRIMARY KEY,
  name TEXT,
  category TEXT,
  spec TEXT,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recycle_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT,
  deleted_by TEXT,
  deleted_at TEXT,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  actor TEXT,
  created_at TEXT,
  detail TEXT,
  value TEXT NOT NULL
);
