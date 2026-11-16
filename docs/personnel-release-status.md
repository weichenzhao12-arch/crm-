# Personnel Release Status

## Implemented Locally

- Separate position metadata from existing action permission flags.
- Director, supervisor, sales, clerk, warehouse and other position choices.
- Direct supervisor selection and shared client/server hierarchy validation.
- Reject missing/disabled supervisors, self-reporting, cycles and non-manager supervisors.
- Warehouse preset preserves metadata types and resets reporting to the warehouse position.
- Manager normalization no longer implicitly grants cost calculation.
- Local department changes and departure/customer/order handoff (see personnel-handoff.md).

## Not Ready For Production

- Position metadata does not yet enforce department/team customer scope. Existing explicit
  viewAllCustomers permissions remain unchanged; never treat position labels as security boundaries.
- Scoped manager/director reads, writes, assignment targets, exports, statistics and warehouse
  customer selection require shared server-side scope enforcement and HTTP isolation tests.
- Warehouse and personnel handoff use local Vite middleware, not deployed D1 handlers.
- Production migration/backup/rollback and production-like concurrency tests remain required.

Do not deploy this branch as a finished hierarchical authorization release.
