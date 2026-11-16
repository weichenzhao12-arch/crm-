CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO departments (id, name) VALUES
  ('sales-one', '销售一部'), ('sales-two', '销售二部'),
  ('logistics', '后勤部'), ('warehouse', '仓库');
ALTER TABLE users ADD COLUMN department_id TEXT REFERENCES departments(id);
CREATE INDEX users_department ON users(department_id);
UPDATE users SET department_id = 'sales-one' WHERE id = 'sales-1';
UPDATE users SET department_id = 'sales-two' WHERE id = 'sales-2';
UPDATE users SET department_id = 'logistics' WHERE id = 'clerk';
UPDATE users SET department_id = 'warehouse' WHERE id = 'warehouse';
