CREATE TABLE IF NOT EXISTS crm_customer_handoffs (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  progress_note TEXT NOT NULL CHECK (length(trim(progress_note)) > 0),
  next_action TEXT NOT NULL CHECK (length(trim(next_action)) > 0),
  due_at TEXT NOT NULL CHECK (length(trim(due_at)) > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS crm_customer_handoffs_customer_created
  ON crm_customer_handoffs (customer_id, created_at DESC);
