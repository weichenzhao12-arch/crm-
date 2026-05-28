CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  password TEXT NOT NULL,
  permissions TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO users (id, account, display_name, role, enabled, password, permissions)
VALUES
  ('owner', 'admin', '主账号', 'owner', 1, '123456', '{"manageProducts":true,"manageMaterials":true,"importExcel":true,"manageUsers":true,"exportQuote":true,"temporaryEdit":true}'),
  ('sales-1', 'sales1', '销售一部', 'quoter', 1, '123456', '{"manageProducts":false,"manageMaterials":false,"importExcel":false,"manageUsers":false,"exportQuote":true,"temporaryEdit":true}'),
  ('sales-2', 'sales2', '销售二部', 'quoter', 1, '123456', '{"manageProducts":false,"manageMaterials":false,"importExcel":false,"manageUsers":false,"exportQuote":true,"temporaryEdit":true}');
