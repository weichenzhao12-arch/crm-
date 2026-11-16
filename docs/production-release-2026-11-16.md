# Production Release 2026-11-16

Target: quote-crm-system / glass.neiceban.com.

- Pre-release database export saved on D drive under ignored `.local-data/backups/` and restored
  into an in-memory SQLite database for integrity verification: ok.
- Previous production deployment: 93b81b5d-1aa0-48ff-b2a3-b959e316016f.
- Existing production baseline: 5 users, 5 normalized customers, 5 app-state rows.
- Actual Cloudflare staging acceptance passed: auth, customer isolation, concurrent reservations,
  shipping, replay, cut remnants, cancellation, department transfer, public dealer output isolation.
- Production additive migrations 0009 through 0015 applied successfully. No local seed data imported.
- Warehouse/personnel server flags enabled. Dealer secret is independently generated and stored
  outside Git; no production default password fallback.
- Deployment configuration matches the existing live D1/R2 bindings. The unused Browser binding
  was removed from the local manifest to match live configuration; PDF remains deferred/unbound.
- Frontend built with VITE_CLOUD_MODULES and VITE_CRM_FEATURES enabled; compiled Worker packaged
  as the advanced-mode dist/_worker.js artifact (generated file, not source).

## Released And Verified

- Production deployment: d190b0f2.quote-crm-system.pages.dev, source commit f5dfdd8.
- Verified custom domain: https://glass.neiceban.com/.
- GitHub default branch `dev` fast-forwarded from 4f12796 to f5dfdd8; review branch also synchronized.
- Post-release module health: D1/R2/warehouse/personnel ready; PDF remains unbound and deferred.
- Actual production acceptance passed: unauthenticated denial, warehouse-only isolation from CRM/admin,
  concurrent reservations, shipment, idempotent replay, automatic cut remnants, cancellation, return,
  zero balance and dealer visibility isolation. SPA routes and JavaScript assets returned HTTP 200.
- Production acceptance used a dedicated short-lived warehouse-only identity, a clearly labeled test
  stock and two test dispatches. All test stock was returned/zeroed before targeted fixture removal.
  Test sessions were revoked; only the identified disposable fixtures were removed. Real customers
  and existing user permissions/passwords were not changed by acceptance tests.
- Dealer password is stored only in the ignored D-drive file `.local-data/dealer-access-password.txt`;
  do not commit it, embed it in URLs, or put it in frontend variables.
- Physical printer output and staff warehouse acceptance are still required. No claim of zero bugs.
