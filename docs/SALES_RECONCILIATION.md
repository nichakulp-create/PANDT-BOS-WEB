# Sales reconciliation and incremental preparation

This change adds a monthly sales reconciliation table under CEO → data readiness. It uses the existing signed-in snapshot responses and introduces no new client API or permissions. It distinguishes included amounts, known amounts held for review, all known amounts, and unknown amounts. Arithmetic agreement is not financial certification or a new live Sheets read. Month/review buttons open existing row evidence in the matching company and month.

`buildSalesSnapshots` reuses the established Folow parser: P&T only, signed Net Total before VAT, duplicate and unknown rows withheld, no inferred Part allocation. The existing all-domain builder remains unchanged.

## Incremental preparation

```sh
node scripts/prepare-sales-sync.cjs PRIVATE_SOURCE PRIVATE_BASELINE PRIVATE_OUTPUT YYYY-MM-DD YYYY-MM ...
```

- Source: a complete bounded Folow grid including its original header, `sourceId`, `tab`, `range`, and the actual `readAt` timestamp. Read all rows, preserve blank rows and original row numbers, and use unformatted values for dates/numbers. The caller must verify complete coverage against current sheet metadata; the planner does not perform the extraction.
- Baseline: latest `bos_revenue_snapshots` records for those sales months, including `id`, `summary`, and complete evidence `rows`. Never use the metadata-only cards view as a baseline.
- Output: private `plan.json` and `import.sql`. The command has no network or database write path. Do not place input/output or source data in this public repository, including through symlinks. Output summaries on stdout contain counts only.
- The planner compares canonical row content and calculation scope, ignoring only provenance read timestamps. Unchanged months are skipped. A new calendar day can change a future-document classification even when sheet cells did not change; those changes are included.
- Older reads, duplicate baseline months and shrinking monthly row counts stop preparation. A row-count shrink can be legitimate, but requires manual reconciliation before using a revised baseline. These checks do not replace verifying complete extraction.
- Execute the generated SQL only through the authorized server-side connection to the existing BOS database. It appends snapshots in one transaction, uses a short table lock and timeout, checks the expected latest snapshot ID, and permits exact replay without duplicate inserts. It does not overwrite source rows or alter RLS, grants, access records or schema.
- Verify latest value, content hash, evidence row count and independently summed included amounts after import.

## Limits and scheduling

This release prepares and validates incremental sales imports; **it does not install an automatic sync worker or schedule**. The existing browser timer still only reads already-imported snapshots. An unattended worker needs an approved durable runtime and its own authorized read access to the Sheets source plus server-side import access. A connected interactive tool session is not a reusable worker credential. Do not put either credential in the website or ask for secrets in chat.

Skipping an unchanged month deliberately retains that snapshot's original source timestamp. There is no separate persisted “checked with no change” ledger in this release, so the UI conservatively displays the original read time. Other source families retain their own dates. No production-owner browser session was used for database reconciliation.

## Verification

The release gate covers unchanged rereads, date rollover, incremental replay, old/truncated inputs, optimistic concurrency SQL and delimiter-safe quoting. UI checks cover inconsistent totals/counts, zero/missing amounts and held items. The browser suite uses synthetic data only and checks four viewports, company isolation, monthly drilldown, review filters and zero business writes. Private reconciliation results belong outside this public repository.
