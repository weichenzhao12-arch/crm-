# Warehouse Local Reliability

This change is local-only. It does not deploy or connect warehouse routes to production D1.

## Storage

- Default database: `.local-data/crm.sqlite` in the D-drive checkout.
- SQLite uses WAL, FULL synchronous commits, foreign keys and a 5-second busy timeout.
- `local_migrations` applies SQL migrations exactly once and checks their checksums on restart.
- Demo seeds run once. Restarts never reset inventory, reservations, orders, users or audit history.
- `LOCAL_CRM_MEMORY=1` explicitly enables disposable integration-test storage.
- `LOCAL_CRM_DB` may point to another non-C-drive SQLite file; do not point testing at a production export.
- Database files and backups are ignored by Git. They contain customer data and must not be committed.

## Backups And Restore

- A daily snapshot is created on startup or the hourly backup check while the service is running.
- Snapshots are under `.local-data/backups` and are integrity-checked.
- Snapshots use SQLite VACUUM INTO, not a copy of a live database file that might omit its WAL.
- No backup or business record is automatically deleted.
- Restore only with all local servers stopped. Preserve the current database and WAL files first.
- Restore a verified snapshot into a new filename, set LOCAL_CRM_DB to that file, start the local server,
  and reconcile orders, reserved quantities, physical balances and audit records before replacing anything.
- Backups on the same drive are not disaster recovery. A separately controlled offline copy is still required.

## Submission Contract

- Every warehouse mutation requires an Idempotency-Key header.
- The key is scoped to the authenticated actor; payload hashes are canonical SHA-256 values.
- Authorization is checked again on replay. A reused key with a changed payload returns 409.
- Order, stock, audit entry and submission reference commit within one BEGIN IMMEDIATE transaction.
- Failed transactions do not consume the key or partially update inventory.
- A replay resolves the original order ID and returns its CURRENT authorized view, not a second order.
- Frontend pending keys survive refresh in sessionStorage, indexed by a payload hash; no recipient data
  is stored in that pending-key registry. A deliberate new form after confirmed success is a new intent.
- Keys are not automatically expired: repeated old submissions must not become new stock movements.

## Tests

- Real SQLite restart, repeat-migration/seed protection, backup integrity and restore.
- Two independent database connections competing for one batch of stock.
- Duplicate create/receive/ship, changed payload rejection, invalid-line transaction rollback.
- Pending-key reuse across client refresh, with independent actor scopes.
- Existing HTTP acceptance suite: use a fresh LOCAL_CRM_MEMORY=1 local server.

## Remaining Production Blockers

Update 2026-11-16: D1 Functions handlers and atomic revision guards have now been implemented and
adapter-tested. The following earlier notes describe the pre-adapter state. For current release gates,
flags, migrations and outstanding Cloudflare-runtime acceptance see cloud-modules-rollout.md.

- Migration 0009 is D1-compatible schema preparation, not a completed D1 API implementation.
- Warehouse routes are still a local Vite middleware. SQLite BEGIN IMMEDIATE must NOT be copied
  blindly to D1; production requires a D1-supported atomic-write and concurrency implementation.
- Current warehouse queries still scan inventory/orders; indexes and paged filtered queries are needed
  before larger production use. D1 read/write quotas must be measured after the adapter is implemented.
- Formal production migration, backup/rollback rehearsal and production-like multi-instance tests remain.
- Physical stocktake, partial returns, lock-age reminders and physical printer acceptance remain separate work.
