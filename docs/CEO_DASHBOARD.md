# CEO Dashboard — implementation and verification

## Status

The CEO interface is implemented and browser verified locally. This is not a production acceptance or a deployment. The preview images use synthetic DEMO data, not company figures.

## Black background and vivid accents — 28 September 2026

The user's latest visual direction replaces navy surfaces with a pure black page and near-black panels/drawer. Status semantics and the full-screen layout remain unchanged.

- Saturated green, yellow, red and cyan/purple chart accents; solid status chips with dark text; stronger KPI values, icons and borders. Missing data retains a neutral gray style.
- Changes are presentation-only: JavaScript differs only in static color literals. Shared styles for the other management pages are unchanged.
- Existing browser verification passed all 11 viewports, 28 detail entry points and status transitions, with no page scrolling or unexpected console errors. Desktop, mobile and drawer screenshots were visually inspected.
- `CEO-black-vivid-preview.png` and `CEO-black-vivid-drawer-preview.png` use synthetic DEMO data. This revision is committed locally and has not been published.

## Status colors — 28 September 2026

- Added consistent status accents on KPI cards, process tiles, panel headers, AI priorities, evidence rows and detail summaries. A visible legend, symbols, Thai labels and accessible names keep meaning available without color alone.
- Green means a card passes the existing evidence-readiness gate. Amber means evidence needs review (including partial/reference values). Red means an explicit block or stale source/event data needs urgent review. Gray means missing or unavailable values. Missing values stay `—`; green does not claim good business performance.
- The overall panel color uses the most urgent available evidence status; Order Status remains neutral until order-level evidence exists. Existing amounts, readiness calculations, auth, API contracts and non-CEO screens are unchanged.
- Verified all 11 viewports with the existing Playwright/Chromium harness: no page scrolling; 28 detail entry points; desktop 75% drawer and mobile full-width drawer; no unexpected console errors. Additional synthetic cases verify green/amber/red/gray, status changes after refresh, blocked amounts remaining hidden, and matching detail colors.
- `CEO-status-preview.png` and `CEO-status-drawer-preview.png` show synthetic mixed-status DEMO fixtures, not P&T results. The update is committed locally and has not been published.

## Fullscreen refinement — 28 September 2026

The user's latest requirement is a dashboard with no horizontal or vertical page scrolling. This supersedes the earlier stacked mobile layout.

- Fix the CEO page to the dynamic viewport at every breakpoint; retain normal layouts on the other management screens.
- Keep all eight KPIs and six panels visible on desktop, short laptop windows, landscape tablets and tall portrait tablets.
- Use all eight summary KPIs plus six accessible panel tabs on smaller/shorter screens. Selecting a panel replaces it in place; the page does not scroll. Tab keyboard navigation supports arrows, Home and End.
- Add an explicit full-screen toggle. It runs only after the user's click; browser restrictions produce a clear fallback message.
- Replace the horizontally scrolling phone menu with a compact native menu.
- Adapt spacing, chart heights and summary rows to prevent panel contents overlapping in short windows. Business values, data contracts and authorization are unchanged.
- The evidence drawer keeps its own internal scrolling, separate from the fixed dashboard.

Browser checks cover 11 viewports: 1366×768, 1440×900, 1920×1080, 1280×720, 1366×600, 1024×768, 768×1024, 390×844, 390×667, 844×390 and 820×780. All passed the no-page-scroll checks, with the applicable overview or panel-tab layout. Verified nested content bounds on desktop, all six compact panels, keyboard tab changes, and full-screen enter/exit. Fixtures remain synthetic.

The agent-browser CLI could not start its daemon in this environment. Browser verification and screenshots were completed with the existing Playwright/Chromium harness instead.

## Changed

- `index.html`: one consolidated CEO stylesheet; eight KPIs and six panels following the supplied control tower reference. The unused previous CEO renderer was removed. Management pages remain available.
- Detail drawer: 75% of desktop width, 100% at tablet/mobile widths; four tabs, keyboard navigation, focus restoration, selected KPI state and internal scrolling.
- Snapshot month selection isolates company, month and generation. The newest available generation is selected within each scope.
- Authenticated evidence is read on demand from `bos_snapshot_months`, using the existing access policy. One cached read per scope; explicit retry after errors.
- Evidence includes valuation basis, dates, certification, row/money coverage, unknown reasons and source-table status.
- Action and Decision forms can be opened from evidence. Opening a draft performs no write. The existing submit flow, roles and database policies remain in force.
- Refresh failures retain the previous data with an explicit warning. Requests time out after 20 seconds. Logout clears rendered business data and evidence caches. A refresh that finishes after session invalidation cannot restore that session.
- `.github/workflows/deploy-pages.yml`: update the UI marker check, validate inline JavaScript syntax, stage only `index.html` for Pages. Deployment has not been executed.
- Removed the ineffective `frame-ancestors` directive from the HTML meta CSP because browsers ignore it there and emit a console error. This did not provide frame protection previously. If frame restrictions are needed on the chosen host, they must be delivered as an HTTP response header. Other CSP directives remain unchanged.

## Data rules

1. Existing snapshot values remain visible with their age and limitations. Unknown is `—`; a measured zero remains zero.
2. Sales Actual requires an explicit `FOLOW` source identifier (case insensitive). Free text mentioning Folow and the legacy FIN sales card do not qualify. FIN evidence remains visible in the drawer. This change does not install an upstream Folow adapter.
3. No Working Capital aggregate: material cost, full active Job values, QA and FG selling-price references have different meanings and may overlap.
4. Expenses, FIN costs and purchase balances remain separate. No total cost or gross margin is inferred from them.
5. Forecast, order register, FG issues and sales are separate populations. Funnel conversion is withheld until a matched population is available.
6. OTD, order status counts, customer/item/supplier rows and urgent orders remain unknown when source records are absent.
7. Historical charts show stored snapshot values, with gaps for missing values. Deltas and sparklines require the same company, source, basis, kind and status; both periods must be certified, nonpartial, and have separate as-of dates within their respective months at the same day of month. Zero denominators are not converted into percentages. This is intentionally conservative.
8. Data readiness is the count of cards passing the declared gate, not model confidence. AI Manager is an explicit rule/evidence summary; no paid AI call is made.
9. Source business data, database schema, RLS policies and ingestion services were not changed. No company records or credentials are included in fixtures or screenshots.

## Browser acceptance

Chromium 133 through Playwright, with Thai fonts installed in the local verification environment. REST/auth calls are intercepted by synthetic fixtures. This verifies browser behavior and API request shapes, not a real user's authenticated production session.

| Viewport | Body scroll | KPI row | Drawer width |
| --- | --- | --- | --- |
| 1366 × 768 | None | 8 in one row | 1024.5 px (75%) |
| 1440 × 900 | None | 8 in one row | 1080 px (75%) |
| 1920 × 1080 | None | 8 in one row | 1440 px (75%) |
| 1024 × 768 | None; six-panel overview | 8 in one row | 1024 px (100%) |
| 390 × 844 | None; switch panels with tabs | 4 per row | 390 px (100%) |

Also verified:

- No clipped desktop panel/KPI content or horizontal body overflow.
- 28 distinct primary detail entry points.
- Evidence cache, scoped month/generation/company reads, retry and refresh failure display.
- Arrow/Home/End tab navigation, Escape close and focus restoration.
- HTML in evidence is escaped.
- Legacy FIN cannot become Folow Sales Actual; a matching source can display a value.
- Compatible prior-period delta; repeated stock as-of dates suppress comparison.
- Zero, missing, invalid and empty snapshot cases.
- Action request links the card/source; Decision stays DRAFT. Writes are mocked and confined to management/audit endpoints.
- Viewer has no write controls; unauthenticated page makes no business reads; denied access does not read snapshot cards.
- Login, session restoration and logout behavior with mocked auth. No production account password was entered.
- Zero unexpected console errors. Explicit HTTP 503 diagnostics occur only in the intentional failure fixtures.

### Repeat locally

Install Playwright in a development environment, then run:

```sh
node tests/ceo-browser.cjs
```

If needed, set `NODE_PATH` to the directory containing Playwright and `BOS_CHROMIUM_PATH` to an installed Chromium binary. `BOS_SCREENSHOTS` sets the output directory (default `/tmp/bos-verification`). No test dependency is loaded by the application.

## Remaining production work

- Publish the reviewed branch to the approved repository, then review and deploy through the existing main-branch workflow. The branch is local pending explicit authorization for the public repository destination after automatic approval review rejected the earlier push.
- Verify login and evidence access using a real authorized session after deployment.
- Update/certify the upstream snapshot. The connected snapshot inspected during this task was last read on 20 September 2026 and was not production accepted.
- Connect Folow to the snapshot contract; provide physical WIP/cost valuation, nonoverlapping QA/FG balances, order-level delivery data, matched cost/sales periods and approved targets before enabling the withheld metrics.
- No anomaly amounts, trend shapes, targets or order rows from the reference image are copied into actual business data.

## Revenue extension (2026-09-28)

See [REVENUE_EVIDENCE.md](REVENUE_EVIDENCE.md) for the new revenue source contracts, detail filters, source links, overdue queue, verification and release authorization. The user approved both destinations on 2026-09-28; the revenue payloads are imported and reconciled in Supabase, and the frontend publishes through the existing GitHub Pages workflow. Black/vivid status styling is preserved. Refresh currently retrieves imported snapshots, not a live Sheets sync.
