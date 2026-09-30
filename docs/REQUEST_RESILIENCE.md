# BOS request resilience — 30 September 2026

The dashboard starts several independent Supabase reads together. Previously each expired-token response could initiate its own refresh, and a late 401 could rotate an already refreshed session again. The previous REST deadline also stopped at response headers, leaving a stalled response body unbounded. Auth requests had no deadline.

The browser now shares one in-flight refresh within its session and reuses a token already rotated by a sibling request. It permits only one 401 retry per original request. Session-epoch checks prevent old reads from retrying under a newly signed-in account and prevent late refreshes from restoring a logged-out session.

JSON requests have a 20-second deadline covering both headers and body. This applies to REST, login, refresh, password recovery and password update. A timed-out write is not replayed automatically; existing error handling remains in place. This is a per-request bound, not a claim that a whole paginated dashboard load completes within 20 seconds.

No business formulas, snapshot contracts, membership policies, source data or database schema change. Automatic Google Sheets ingestion is still not enabled. Snapshot refresh reads imported data; it does not update the source-read timestamp.

`node scripts/verify-release.cjs` includes nine test groups. The new synthetic transport tests cover concurrent and delayed 401 responses, bounded retries, 403 handling, failed writes, logout races, stalled headers/body and malformed refresh recovery. Browser CI uses synthetic fixtures only and separate temporary test dependencies. It never authenticates to the production database. Owner-session production acceptance remains a separate unresolved check.

Rollback: revert this frontend PR through the existing workflow. No database rollback or data deletion is needed.
