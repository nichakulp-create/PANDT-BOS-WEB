# CEO order follow-up — 2026-09-28

The CEO priority panel now opens overdue orders directly, instead of showing only data-readiness issues. Missing due dates receive a separate data-check entry. The detail drawer gives the reason and proposed follow-up for each priority; it does not call a paid AI model.

## Evidence and calculations

- Uses the existing company/month revenue snapshot and its authenticated, read-only evidence endpoint. No database, permission, source-sheet, import or valuation changes.
- Ages each valid due date against `data_as_of`, never the viewer's current date. Dates must be valid ISO calendar dates. Missing/invalid due dates or snapshot dates stay unknown.
- Buckets: overdue 1–7, 8–30 and 31+ days; due in 0–7 days; due beyond 7 days; unknown. Due on the snapshot date is not overdue.
- Counts are line items, not distinct purchase orders. Cards summarize the complete snapshot before detail filters.
- Amounts include only `INCLUDED` rows with known values. Review amounts are withheld. A nonempty bucket without any known included amount shows a dash; a known zero remains zero. Order balances are not losses, invoice revenue or actual delivery OTD.
- Detail rows sort by earliest due date, unknown dates last. Customer, text, calculation status and due-date filters combine. Dropdowns filter immediately and preserve keyboard focus. Changing delivery filters clears a conflicting overdue shortcut. Reset clears all filters.
- Overdue and missing-date priorities carry the snapshot date. Source freshness remains independent: the confidence drawer lists each card's data date, source-read time in Bangkok time and age, oldest first.

## Follow-up draft

Owners/executives can prepare an action from the filtered order list. The existing action form is prefilled with company, month, snapshot reference, source-read time, selected filters, matching count and up to five example lines. Opening the draft performs no write. A user must submit the existing form to create an action; source business records are never edited.

## Verification

- `tests/order-followup.cjs`: valid/invalid calendar dates, leap day, year rollover, 1/7/8/30/31-day boundaries, current-day/7-day upcoming boundary, unknown dates, combined filters, stable sorting, cache nonmutation and review-value exclusions.
- `tests/revenue-browser.cjs`: synthetic priority-to-evidence flow, age buckets, immediate dropdown filtering, scoped action draft with zero writes, freshness table, mobile layout; retains >1,000-row pagination, company/month isolation, escaping, retry and logout-race checks.
- Existing CEO browser suite passes 11 viewport sizes, keyboard controls, 75vw/100vw drawer widths and no body scrolling. Revenue suite passes six viewport sizes. No application JavaScript errors in the successful test runs.
- Local read-only reconciliation against the already imported order snapshot confirms bucket counts match the prepared overdue/unknown-date summaries. No real business rows or new screenshots are published in this change.
- Visual review uses synthetic screenshots only. Real owner sign-in remains untested. Refresh still reads imported snapshots; this release does not schedule or perform a new Sheets sync.
