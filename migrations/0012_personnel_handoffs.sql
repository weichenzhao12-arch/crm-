CREATE TABLE personnel_handoff_batches (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, source_id TEXT NOT NULL,
  request_key TEXT NOT NULL, request_hash TEXT NOT NULL, mode TEXT NOT NULL,
  reason TEXT NOT NULL, assignments TEXT NOT NULL, result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(actor_id, request_key)
);
CREATE TABLE personnel_departures (
  user_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL,
  actor_id TEXT NOT NULL, reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER prevent_departed_account_reactivation BEFORE UPDATE OF enabled ON users
WHEN NEW.enabled = 1 AND EXISTS (SELECT 1 FROM personnel_departures WHERE user_id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'OFFBOARDED_USER'); END;
