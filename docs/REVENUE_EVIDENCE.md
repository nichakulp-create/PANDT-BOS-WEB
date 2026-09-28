# Revenue evidence extension — 2026-09-28

Status: release authorized by the user on 2026-09-28. The reviewed revenue payloads have been imported into the existing BOS Supabase project. Database totals, row counts, review counts and content hashes match the prepared snapshots. Source publication uses the existing GitHub Pages workflow on `main`. Initial automatic-review blocks were resolved by explicit approval for both the database destination and the public code repository.

## Changes

- CEO revenue cards overlay the five affected metrics independently. Legacy inventory, quality and cost metrics keep their original source timestamps and calculations.
- The detail drawer displays included and withheld amounts, missing-value reasons, customer/document/Part search, status filters, filtered subtotals, 50-row pagination and links to exact source rows and reference prices.
- All evidence rows are retrieved as one snapshot JSON array on demand, so the Data API's row limit cannot silently truncate transaction arrays over 1,000 entries. Responses are count-checked, escaped, cached by snapshot and cleared on reload/logout; a late response cannot repaint a logged-out screen.
- Open orders include overdue counts and a compact queue ordered by earliest due date. Smaller screens show fewer preview entries; the drawer contains the complete list. These counts do not claim actual delivery OTD.
- The application identifies imported snapshots explicitly. Refresh reads imported data; it does not automatically reread Sheets. There is no scheduled refresh in this release.

## Calculation contracts

| Metric | Source and formula | Scope and limitations |
| --- | --- | --- |
| Actual sales | `Folow`, signed Net Total before VAT | P&T only, exclude TSP. Never divide Net Total by 1.07. Duplicate documents, absent customer/value and inconsistent periods are withheld for review. Folow has no Part field; no fabricated Part allocation. |
| Forecast | Original `Forecast` FC-month quantity × customer/Part price from `Sales Price` | OR columns are not FC. The `forecast_plan` header does not match its data and is deliberately unused. Current reference price is not certified historical pricing. |
| Orders received | Active/history records, deduplicated by order ID; full quantity × explicit PO price or exact customer/Part reference | Group by `received_date`. Rows without this date are counted as unassigned and excluded from every monthly subtotal; creation/order dates are not substituted. Active record takes precedence over the archived record. |
| Open orders | Active delivery view, remaining quantity × row price or exact customer/master-Part reference | Only the month of the actual read, not a reconstructed historical month-end balance. Closed/cancelled/zero-remaining entries are excluded. Due before the as-of date means overdue, not proof of actual late delivery. |
| FG issues | Outgoing `StockFG_Transaction` quantity × transaction unit price | Stock Value is the resulting stock balance, not the transaction amount. Valid cancellation references become signed reversal events in their cancellation month. Missing/conflicting references and test records are withheld. This is operational evidence, not Invoice revenue or confirmed customer receipt. |

Unknown quantities/prices remain null, not zero. A known zero quantity can have a known zero amount. Price matches are scoped to customer and Part; conflicting reference prices are withheld. Exact decimal multiplication and half-away-from-zero row rounding avoid binary floating point cent errors. Known subtotals are separate from withheld known amounts and unknown values. Passing calculation rules never sets `production_accepted=true` or implies financial certification. Source/read-time provenance is retained for every contributing sheet.

## Storage and authorization

`db/revenue_evidence.sql` is the reviewed schema source applied through the Supabase migration tool as `bos_revenue_evidence_readonly` to the existing BOS project `ghpkuhrkxuukztwlgudq`. It is not a CLI-generated migration filename. The CLI is unavailable in this workspace.

- `bos_revenue_snapshots`: one versioned evidence payload per company/month/card/content hash; summary and rows are inserted atomically. Row-count check and unique content key support validation and idempotency.
- `bos_revenue_cards`: latest card per company/month/metric, with `security_invoker=true`; does not expose transaction arrays during initial dashboard load.
- RLS requires a signed-in, non-anonymous, active member of existing `bos_access`. Anonymous role has no SELECT. Authenticated clients have SELECT only and no INSERT/UPDATE/DELETE grant. No service key is added to the client.
- No existing snapshots, business source sheets or access records were modified.
- Live catalog checks confirmed RLS, invoker view, denied anonymous reads, denied authenticated writes and successful import reconciliation. No live owner login/session was used.
- Security advisor reported no finding on the new table/view. Existing unrelated project findings were left unchanged: [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [anonymous access policies](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins), and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Verification

- Pure model checks cover signed money, decimal cent rounding, company and period isolation, missing versus zero, duplicate invoices, reference price conflicts, FC versus OR, history/active precedence, unassigned dates, current-only open orders and reversal validation.
- Independent Decimal calculations checked every prepared operation amount. Raw P&T Folow monthly registers for July–September reconciled to included plus withheld known amounts. This is an arithmetic reconciliation, not business certification.
- Existing CEO acceptance suite: 11 viewports, 28 detail entry points, no body scroll, 75vw desktop/100vw smaller drawers, auth and role gates, fullscreen, keyboard, missing-value behavior and error recovery.
- Added browser suite: six desktop/tablet/mobile viewports, scoped overlays, historical-open suppression, filters and subtotals, pagination past row 1,000, source links, escaped source text, evidence retry, unavailable revenue API and logout race. Backend responses and sessions are synthetic; zero production browser writes.
- Preview images contain only synthetic DEMO data, not private customer or transaction data.

## Reproduce locally

```sh
node tests/revenue-model.cjs
NODE_PATH="$CODEX_PRIMARY_RUNTIME_NODE_MODULES" BOS_CHROMIUM_PATH=/tmp/chromium node tests/ceo-browser.cjs
NODE_PATH="$CODEX_PRIMARY_RUNTIME_NODE_MODULES" BOS_CHROMIUM_PATH=/tmp/chromium node tests/revenue-browser.cjs
```

`node scripts/prepare-revenue-import.cjs PRIVATE_INPUT PRIVATE_OUTPUT YYYY-MM-DD YYYY-MM ...` prepares snapshots only; it has no network/database write path and refuses input/output paths inside the repository. Raw inputs and generated evidence payloads must remain outside the public repository. Imports use an authorized server-side connection. Only source code and synthetic verification artifacts are included in the public repository; never commit business data.
