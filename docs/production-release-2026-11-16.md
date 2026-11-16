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

Production deployment and post-release acceptance results will be appended after verification.
