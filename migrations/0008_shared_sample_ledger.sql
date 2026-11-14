CREATE TABLE crm_sample_ledger (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  value TEXT NOT NULL
);
INSERT INTO crm_sample_ledger (singleton, value) VALUES (1, '{"samples":[],"entries":[]}');
