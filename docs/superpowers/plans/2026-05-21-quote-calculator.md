# Quote Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a usable quotation calculator with editable prices and Excel quotation export.

**Architecture:** Import the company workbook into static JSON data, keep quote and settings state in a Pinia store, isolate calculation/export logic in tested helpers, and replace the template home page with a single-page business tool. Settings edits persist in browser storage for daily work and can be exported as JSON for replacing the project data file.

**Tech Stack:** Vue 3, Vite, Pinia, Vitest, TypeScript, SheetJS `xlsx`, static JSON data.

---

## File Structure

- Create `src/features/quote/types.ts` for product, material, quote line, and settings types.
- Create `src/features/quote/pricing.ts` for parsing tiered price text, selecting unit prices, and totaling quote lines.
- Create `src/features/quote/excel.ts` for generating the Excel quotation workbook.
- Create `src/stores/quote.ts` for quote metadata, selected lines, edited prices, and persistence.
- Create `src/data/pricing.json` from the workbook.
- Replace `src/pages/index.vue` with the calculator, settings, and preview UI.
- Modify `package.json` and `pnpm-lock.yaml` by installing `xlsx`.
- Add `test/quote-pricing.spec.ts` and `test/quote-excel.spec.ts`.

## Tasks

### Task 1: Install Excel Dependency

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] Run `pnpm add xlsx`.
- [ ] Confirm `package.json` contains `"xlsx"`.

### Task 2: Extract Workbook Data

**Files:**
- Create: `src/data/pricing.json`

- [ ] Use a small one-time script to read `C:\Users\Administrator\Desktop\调整最新价格表货号xlsx(1)(2).xlsx`.
- [ ] Extract product rows from fence, leisure, sports, and landscape turf sections.
- [ ] Extract material rows from construction materials and accessories sections.
- [ ] Normalize product fields to `id`, `category`, `shippingFrom`, `itemNo`, `height`, `model`, `needleRow`, `density`, `poundWeight`, `backing`, `priceText`, `needlePrice`, `warranty`, `note`.
- [ ] Normalize material fields to `id`, `category`, `name`, `spec`, `unit`, `unitPrice`, `note`.
- [ ] Verify the JSON contains non-empty `products` and `materials` arrays.

### Task 3: Add Types And Pricing Tests

**Files:**
- Create: `src/features/quote/types.ts`
- Create: `test/quote-pricing.spec.ts`

- [ ] Write tests for price parsing:
  - `50-1000平16元一平` parses to min `50`, max `1000`, price `16`.
  - `1050-10000平15.8元一平` parses to min `1050`, max `10000`, price `15.8`.
  - area `1200` chooses `15.8`.
  - unparseable text returns no tier and allows manual pricing.
- [ ] Run `pnpm test test/quote-pricing.spec.ts` and confirm it fails because `pricing.ts` does not exist yet.

### Task 4: Implement Pricing Helpers

**Files:**
- Create: `src/features/quote/pricing.ts`
- Modify: `src/features/quote/types.ts`

- [ ] Implement `parsePriceTiers(text: string): PriceTier[]`.
- [ ] Implement `selectUnitPrice(text: string, quantity: number): number | undefined`.
- [ ] Implement `lineSubtotal(quantity: number, unitPrice: number): number`.
- [ ] Implement `quoteTotals(lines: QuoteLine[]): { productSubtotal: number; materialSubtotal: number; grandTotal: number }`.
- [ ] Run `pnpm test test/quote-pricing.spec.ts` and confirm it passes.

### Task 5: Add Excel Export Tests

**Files:**
- Create: `test/quote-excel.spec.ts`

- [ ] Write a test that builds a quote with one product line and one material line.
- [ ] Assert `buildQuoteWorkbook` creates sheets named `报价单`, `产品明细`, and `材料明细`.
- [ ] Assert the workbook contains the customer name and grand total.
- [ ] Run `pnpm test test/quote-excel.spec.ts` and confirm it fails because `excel.ts` does not exist yet.

### Task 6: Implement Excel Export

**Files:**
- Create: `src/features/quote/excel.ts`

- [ ] Implement `buildQuoteWorkbook(quote: QuoteExportPayload): XLSX.WorkBook`.
- [ ] Implement `downloadQuoteWorkbook(quote: QuoteExportPayload): void`.
- [ ] Keep exported columns readable in WPS/Excel.
- [ ] Run `pnpm test test/quote-excel.spec.ts` and confirm it passes.

### Task 7: Add Quote Store

**Files:**
- Create: `src/stores/quote.ts`

- [ ] Load default data from `src/data/pricing.json`.
- [ ] Track quote metadata: customer name, date, remark.
- [ ] Track quote lines for products and materials.
- [ ] Add actions for adding, updating, deleting lines, editing prices, saving settings to local storage, and exporting edited JSON.
- [ ] Keep calculation in `pricing.ts`; the store should not duplicate math logic.

### Task 8: Replace Home Page With Calculator UI

**Files:**
- Replace: `src/pages/index.vue`

- [ ] Build top toolbar with title, customer/date/remark inputs, settings toggle, preview toggle, and Excel export button.
- [ ] Build category tabs and product/material search.
- [ ] Build product/material cards with add buttons.
- [ ] Build quote line tables with quantity, unit price, subtotal, and delete controls.
- [ ] Build summary panel with product subtotal, material subtotal, and grand total.
- [ ] Build settings view for product and material price editing.
- [ ] Build preview view matching the planned quotation layout.

### Task 9: Verify In Browser

**Files:**
- No code changes.

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Open `http://127.0.0.1:5173/`.
- [ ] Verify products and materials appear.
- [ ] Add one product and one material.
- [ ] Edit a unit price and confirm the total changes.
- [ ] Open settings, edit a price, save, and confirm it affects the calculator.
- [ ] Generate an Excel workbook and confirm the action does not throw browser errors.
