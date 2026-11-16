# Personnel Changes And Customer Handoff

Local-only implementation: `/api/local-personnel` uses the persistent local SQLite transaction.
It is not wired to production D1 and must not be deployed as a completed production workflow.

## Workflows

- Department change: owner selects a new active department and explicitly keeps customers or transfers a selection.
- Customer handoff: owner, or manager with viewAllCustomers + transferCustomers, can transfer selected customers.
- Departure: owner must transfer ALL remaining customers and resolve outstanding dispatch responsibility.
- Supported allocation: one person, round-robin distribution, exact counts, or individual choices.
- Recipients must be active sales/manager accounts, excluding the source and warehouse-only accounts.
- Department membership does not grant permissions; department change never changes roles or permission flags.

## Safety

- Preview contains source, customer and target fingerprints and an outstanding-order snapshot.
- Commit validates fingerprints again inside BEGIN IMMEDIATE. A stale preview fails as a whole.
- Customer owner fields, JSON snapshots, customer revisions, handoff audit, department change,
  pending-order responsibility, departure marker and session revocation share the same transaction.
- Client writes use persisted idempotency keys. Repeated confirmation returns the original batch.
- Ordinary account snapshots cannot move an existing user to another department: use the handoff workflow.
- Follow-ups, reminders, quotes and historical dispatches retain their customer IDs and history.
- Pending/rejected dispatches move to a responsibleUserId, preserving creator and openedBy.
- Inventory quantities and reservations are unchanged by personnel handoff.
- Departure disables the account, deletes sessions, and prevents silent reactivation/deletion by stale account forms.
- Same-name customer matching is never used. Customers are assigned by stable IDs.

## Operational Notes

- Rehiring/reactivating an offboarded account is intentionally not implemented; use a separately approved process.
- A single batch supports up to 5000 customers. For larger departures a staged workflow is required.
- Historical sales-performance attribution is not changed by this feature and needs its own agreed reporting policy.
- Formal D1 implementation and equivalent transaction/concurrency acceptance remain production blockers.
