CREATE TABLE IF NOT EXISTS warehouse_dealer_sessions (
  token_hash TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS warehouse_dealer_sessions_expiry ON warehouse_dealer_sessions(expires_at);
CREATE TABLE IF NOT EXISTS warehouse_dealer_rate (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  reset_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS warehouse_dealer_rate_expiry ON warehouse_dealer_rate(reset_at);
