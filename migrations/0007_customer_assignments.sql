CREATE TABLE crm_customer_assignments (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX crm_customer_assignments_customer ON crm_customer_assignments (customer_id, created_at);
