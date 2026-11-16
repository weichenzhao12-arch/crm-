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

- Explicit own/team/all scope is now implemented in customer APIs, snapshots, warehouse customer
  selection and frontend lists/statistics. A position label alone never grants a broader scope.
- Team scope requires a supervisor/director position and valid reporting ancestry. Supervisors stay
  within their department; directors may explicitly receive additional managed departments.
- Viewing a team does not grant modification, deletion, export or customer transfer actions.
- Owner-only scope controls synchronize legacy viewAllCustomers. Personal reminders stay self-only.
- Update 2026-11-16: production D1 handlers have been added behind explicit feature flags; see
  cloud-modules-rollout.md. They are not deployed and still require real Cloudflare-runtime acceptance.
- Production migration/backup/rollback and production-like concurrency tests remain required.

Do not deploy this branch as a finished hierarchical authorization release.
