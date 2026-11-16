# Warehouse Spreadsheet Import And Export

Warehouse header actions: download template, spreadsheet receipt, complete inventory export.
The owner has access; other users need explicit warehouseImport / warehouseExport grants.
Receipt, specification creation, private metadata maintenance and dealer visibility rights are still
checked separately. Granting import alone does not bypass them.

## Workbook

- All public specifications: category, code, product name, height, stitches, gauge, backing, density,
  dtex, UV, color, width and full-roll length.
- Internal optional fields: location, batch, production date, supplier and remarks. These are not
  added to the warehouse home table or dealer output. Sales/read-only stock views omit them.
- Read-only snapshots: physical/available/reserved rolls and remnants, physical/available area.
- Editable additive receipts: 本次入库卷数 and 本次入库零货. Exported receipt cells start blank;
  changing or reimporting a snapshot never replaces inventory quantities.
- CSV/XLS/XLSX up to 5MB, 200 nonblank rows. API body limit 1MB. Formula cells are forbidden in inputs.
- Text formatting preserves codes, dates and specifications such as 5/8. Production date uses
  YYYY-MM-DD text. Remnants use 7×2; 3×1 for 7m twice and 3m once.

## Matching And Safety

- Product identity is the complete public specification set plus width and roll length; quantity,
  availability, visibility and private metadata are not product parameters.
- Trimmed code matching is case-insensitive; other specifications match trimmed text exactly.
- An identical product receives additional stock; identical rows in the file are accumulated.
- Same code/size with different technical parameters is a separate product.
- Existing ambiguous duplicates require an explicit inventory ID. A supplied ID must match all specs.
- Conflicting explicit metadata/visibility on rows aimed at one product rejects the whole batch.
- Blank private fields in the workbook leave existing private data unchanged.
- Every row is validated before persistence. Import, audit and idempotency are committed atomically.
- Cloud writes recheck inventory/order revision and current actor/session. Existing locks remain intact.
- The preview retains files and request keys on retry; a confirmed success cannot be submitted twice.
- Private metadata is excluded by both local and cloud dealer endpoints; export uses a separately
  authorized, fresh snapshot endpoint rather than trusting the currently visible table.

Verification before release: 173 automated tests passed; Vue typecheck, production frontend build and
Pages Functions compilation passed. Cloud staging/production release checks are recorded separately.

## Release 2026-11-16

- Source commit: 9db47a2. GitHub default dev and review branches synchronized.
- Actual staging deployment: 608a4425.quote-crm-release-qa-20261114.pages.dev.
- Staging passed identical-parameter merge, duplicate-row aggregation, retry protection, receipts while
  locked, whole-batch rollback, export permission checks and dealer internal-field redaction.
- Production deployment: 9da37d1b.quote-crm-system.pages.dev / glass.neiceban.com.
- Production canary passed new-stock import, identical-row aggregation, idempotent replay, internal
  metadata export and invalid-row atomic rollback. Test stock was zeroed before targeted cleanup.
- Pre-update D1 export was restored into an in-memory database and passed integrity and foreign-key
  checks. Backup and temporary credentials remain outside Git on D drive.
- No schema migration or replacement of existing inventory quantities was required.
