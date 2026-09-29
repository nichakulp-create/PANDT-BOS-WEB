# Evidence across BOS departments

The CEO workspace can now read versioned private evidence for Finance, purchasing, production, capacity, OEE, quality, subcontract plating and source coverage. The existing revenue, expense and balance contracts remain separate.

## Data boundaries

- Finance separates the receivable/payable register, dated receipt/payment evidence, due-date calendar, transfers and adjustments. Full register amounts attached to payment dates are not certified bank movements. Purchase and expense ledgers are displayed separately; no unreconciled net cash or COGS is manufactured.
- Purchasing uses the canonical PR register. A blank receipt quantity is unknown. An outstanding quantity may be derived only from explicitly recorded requested and received quantities; a supplied balance must reconcile. Staging copies do not add another purchase amount.
- Production excludes deleted records, keeps missing dates in a review register, separates OP output and does not turn full job plans into WIP. NG registers and production NG are separate evidence, not additive defects.
- Capacity uses only the source's committed, passing active snapshot and Trusted Load. Review Load remains visible. Eight-hour and 11.5-hour scenarios use the stated machine count, shifts and calendar at 100%; legacy 85% output is not reused.
- OEE reads the monthly KPI source. Missing monthly data remains unknown; daily percentages are not averaged to create a monthly KPI. Daily machine/shift facts retain their source readiness states.
- Plating validates cancellation identity, quantity, original action and chronology before netting movements. Its valuation is a sales-price reference, not inventory cost. Last movement age is not lot age.
- Forecast readiness exposes the current and next working calendar and required reporting/shift inputs. It does not fabricate a delivery forecast where incremental reporting mode and separate 8/11.5-hour observations remain unverified.
- OTD evidence distinguishes due dates from the last stock movement and order closure. An unverified completion date does not become an OTD percentage.
- Empty QA, budget or KPI tables remain empty evidence, not zero defects/spend or completed work.

## Implementation and use

`lib/domain-model.cjs` is a deterministic, side-effect-free adapter. Required headers and complete source reads are checked before preparing snapshots. Each row retains its source location, original typed facts and review reasons. `scripts/prepare-domain-import.cjs PRIVATE_INPUT PRIVATE_OUTPUT` refuses paths within this public repository and performs no network write.

`db/domain_evidence.sql` adds an immutable evidence table and a latest-version view. Authenticated, non-anonymous, active BOS members have SELECT only; public/anonymous access and client writes are not granted. The view uses `security_invoker`. Retiring an import removes it from the latest view while retaining its evidence; this administrative operation is not available to the browser.

The browser loads compact cards with bounded pagination and fetches full rows only when a detail tab is opened. Row reads verify company, month, card, content hash and row count. Failed refreshes retain the previous generation and identify the failure. Logout invalidates pending reads and clears private caches. The drawer supports search, dates, review reasons, pagination, source links and evidence-bound action drafts. Cash-calendar totals are separated by source ledger and direction.

## Release gates and limitations

Run `node scripts/verify-release.cjs`, then browser checks with the available Playwright/Chromium runtime. `tests/domain-browser.cjs` exercises all domain views with synthetic data, 1,101-row pagination, cross-company rejection, retries, logout races and multiple viewport sizes. These are not authenticated production acceptance tests.

Code readiness and real-data import are separate. Some new department imports are pending explicit transfer approval after automatic approval review stopped the batch. Previously accepted rows remain versioned and scoped; absent department/month detail is explicitly unavailable. Do not claim that all departments are populated merely because the adapters and tests pass.

Automatic Google Sheets ingestion is not enabled by this change. The existing refresh control reloads imported BOS snapshots only. Server-side source authorization, bank reconciliation, source certification, missing operational balances, verified forecast inputs and missing monthly KPI evidence remain explicit gates.

Rollback: revert the frontend release through the existing reviewed GitHub workflow. Keep source Sheets and imported evidence intact. If a particular new evidence batch is invalid, use its private import receipt and content hashes to retire that batch under the owner's data governance authorization; do not delete business rows or change source values.

Only code, header contracts and synthetic fixtures belong in this public repository. Raw rows, import payloads, reconciliation results and receipts stay private.
