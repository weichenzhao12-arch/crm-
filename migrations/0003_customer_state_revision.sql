ALTER TABLE app_state ADD COLUMN revision TEXT NOT NULL DEFAULT '';

UPDATE app_state
SET revision = lower(hex(randomblob(16)))
WHERE key = 'customers';
