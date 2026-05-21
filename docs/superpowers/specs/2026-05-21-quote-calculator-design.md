# Quote Calculator Design

## Goal

Build a simple company quotation calculator on top of the SolosVue3 project. The first version focuses on daily sales quoting: choose turf products, add construction materials or accessories, calculate totals, adjust prices in a settings area, and export a customer-facing Excel quotation.

## Source Data

The initial data comes from the company price workbook on the desktop:
`C:\Users\Administrator\Desktop\调整最新价格表货号xlsx(1)(2).xlsx`.

The first version imports these workbook sections:

- Fence turf products.
- Leisure turf products.
- Sports turf products.
- Landscape turf products.
- Construction materials.
- Accessories.

The football field sections for five-a-side, seven-a-side, nine-a-side, and eleven-a-side fields are reserved for a later project-template feature.

## Product Quoting

The main screen is the quotation calculator, not a landing page.

Users can:

- Filter products by category.
- Search by item number, model, grass height, density, or backing.
- Select a product and enter area or quantity.
- Let the app choose the correct unit price from tiered price text when possible.
- Manually override the unit price when the price text cannot be parsed or a special quote is needed.
- Add multiple product lines to one quotation.

Each product line shows useful product details such as category, item number, shipping location, grass height, model, needle row, density, pound weight, backing, warranty, unit price, quantity, and subtotal.

## Materials And Accessories

Users can add construction materials or accessories to the same quote.

Each material line includes name, specification, unit, unit price, quantity, subtotal, and notes. Materials use the same quotation summary as products.

## Settings

The settings area allows price maintenance without editing source code.

Users can:

- Search products and materials.
- Edit product base price, tier price text, and material unit price.
- Save changes in the app state for the current working copy.
- Export an updated JSON data file so the maintained prices can replace the project data file.

The first version stores project data in local JSON files under the app source. It does not require a database or user login.

## Excel Export

After calculating a quote, users can generate an `.xlsx` quotation file.

The exported workbook includes:

- Company quotation title.
- Customer name, quote date, and optional remark.
- Product lines.
- Material lines.
- Product subtotal, material subtotal, and grand total.
- Unit price overrides exactly as used in the calculation.

The export should be readable and ready to send or continue editing in Excel/WPS.

## App Structure

The implementation should keep the feature small and clear:

- Data files for imported product and material records.
- Quote calculation helpers for parsing prices, choosing tiers, and totaling lines.
- A Pinia store for quote state and settings edits.
- Vue components for search, quote line editing, summary, settings, and export actions.

## Error Handling

If a product price cannot be parsed automatically, the app should show the raw price text and require or allow manual unit price input. Missing quantities, invalid numbers, and empty quote lines should be handled inline without blocking the whole page.

## Verification

Development verification should include:

- Product and material data import checks.
- Unit tests for price parsing and total calculation.
- Build or typecheck verification.
- Browser verification that the calculator loads, products can be added, settings can edit prices, and Excel export creates a workbook.
