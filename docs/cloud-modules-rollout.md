# Cloud Warehouse And Personnel Rollout

## Implemented

- Production Functions now register `/api/local-warehouse/*` and `/api/local-personnel/*`.
  Existing URLs are retained for compatibility; they no longer require a Vite server.
- `WAREHOUSE_ENABLED=enabled` and `PERSONNEL_ENABLED=enabled` explicitly enable the handlers.
- Frontend build flag `VITE_CLOUD_MODULES=enabled` exposes the matching modules in a production build.
- Retain `VITE_CRM_FEATURES=enabled` when deploying the newer shared-sample, quote and reminder flows.
- Dealer access requires the `DEALER_PASSWORD` secret. There is no production demo-password fallback.
- Warehouse writes compare the inventory/order revision, current actor/session and any bound customer's
  ownership/scope snapshot before applying a D1 atomic batch. A failed guard aborts the whole batch.
- Stock/order triggers also invalidate warehouse snapshots when personnel handoff changes responsibility.
- Personnel writes compare directory/customer/department/snapshot versions, bulk-write handoffs and revoke
  departing users' sessions in the same batch. Locks and physical balances are unchanged.
- Dealer output uses an explicit public-field allowlist, hashed durable sessions and durable rate limiting.
- Printing does not grant access to others' orders. Defaults explicitly deny unrelated warehouse actions.
- Own/team/all customer scope is enforced on the server and shared with list, quote and statistics views;
  customer reminders remain restricted to their actual assigned salesperson.
- Normal local preview remains unchanged. Set `LOCAL_CLOUD_HANDLERS=1` in local-crm mode to exercise the
  production handlers against a local adapter; `LOCAL_CRM_MEMORY=1` isolates disposable test data.

## Migration And Release Order

1. Keep server feature flags disabled. Verify the exact account, Pages project and existing D1 database.
2. Export a production database backup and verify its contents; record the deployment being replaced.
3. Apply unapplied additive migrations in order, including 0009 through 0015. Do not copy demo inventory,
   demo passwords, test sessions or the local SQLite file into production.
4. Configure a non-default dealer password as a secret; never put it in Git, frontend env vars or logs.
5. Use a staging database/deployment for Cloudflare-runtime concurrency, role-isolation and restart tests.
6. Enable server flags after migration, then verify authenticated APIs and `/api/health` module readiness.
7. Build with the frontend flag, deploy only the verified artifact, and inspect the warehouse/customer/
   permissions/print flows with dedicated test data. Record every test document ID.
8. Complete physical A4 printing and warehouse staff acceptance before treating inventory as the real ledger.

Rollback: disable both server flags, publish the previous frontend artifact, and preserve warehouse tables,
orders, request keys, audits and revision triggers. Do not drop tables or restore an older backup over any
stock movements accepted after release; reconcile those movements before a data restore.

## Verification Boundary

The SQL transaction strategy uses D1 batch rollback plus a checked singleton guard, not an interactive
Node SQLite transaction. Batch rollback is documented at:
https://developers.cloudflare.com/d1/worker-api/d1-database/#batch

On 2026-11-16, Wrangler 4.161.0 compiled Pages Functions successfully. Local D1 migration execution was
attempted only with `--local --persist-to .local-data/cloudflare-qa`; Windows workerd crashed at startup
with access violation / stack overflow. No remote migration or deployment was performed.
Real Cloudflare-runtime and production migration/rollback acceptance therefore remain outstanding.
