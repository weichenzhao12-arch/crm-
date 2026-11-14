# Warehouse And Future Orders

Current scope: local testing only. No deployment or production database connection.

## Current Navigation

- Warehouse: `/warehouse` (inventory, dispatch orders, movements).
- Inventory management: `/warehouse/manage` (filter stock, add specifications, receive, issue by rolls or meters).
- Dealer read-only availability: `/dealer-stock`.
- Existing technical URLs are retained; the internal Chinese display name is now 仓库.

## Future Order Integration

Do not implement receipt-on-completion for an unspecified order type.

- Production/purchase orders: accepted completion creates a linked warehouse receipt.
- Sales orders: reserve inventory, link dispatch and shipment; completion never creates a receipt.
- Confirm with the user which order workflow they need before building the order module.

## Receipt Contract

- Completion is a server-side transition, not a frontend watch or page-load side effect.
- Each receipt has source order ID, completion/acceptance event ID, line ID and operator.
- A unique source event/line key prevents duplicate receipt on retries or repeated clicks.
- Order completion, receipt lines, inventory changes and audit entry share one transaction.
- If validation fails, the order must not be marked received/completed by that transition.
- Receipt quantities use actual accepted rolls and remnant lengths/counts, not only ordered area.
- Specifications and unit conversions are snapshotted; later product edits do not rewrite past receipts.
- Partial acceptance posts only the newly accepted difference, never the entire order again.
- Cancellation or correction uses a linked reversal/return, not deletion of a posted receipt.
- A reversal must not remove stock already reserved or shipped; use the existing availability checks.
- Dealer output continues to expose only approved inventory minus pending reservations.

## Regression Tests Required

Duplicate completion, concurrent completion, partial acceptance, failure rollback, invalid units,
unauthorized completion/receipt, cancellation after receipt, reserved-stock reversal conflict,
and sales completion not increasing inventory.
