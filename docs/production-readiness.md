# CRM release candidate

- Keep CUSTOMER_ROW_API unset for the existing CRM screens. These screens use the scoped, revision-checked customer snapshot endpoint. Do not enable both customer write paths on the same production dataset.
- Before enabling the new navigation, stage migration 0008 in an isolated D1 database and verify account permissions, inventory receipts and issues, backup/restore, and concurrent conflicts. Do not run initial account seed migrations against production blindly.
- Build with VITE_CRM_FEATURES=enabled to include ordinary quotes, shared samples, and reminder UI. Standalone local test HTML is excluded from the production build.
- Shared sample stock starts empty. Browser-local test samples and movements are not imported; use confirmed opening receipts for actual stock.
- Confirm Cloudflare account, Pages production branch, D1 bindings and a backup before deploying. Verify ordinary quote save/reload, customer access and a reversible inventory transaction in staging before production rollout.
