# CODEX TASK — P&T SMART BOS CEO Dashboard

## Objective
Rebuild the CEO dashboard in `index.html` to match the user's supplied **P&T SMART BOS | Executive Control Tower** reference screenshot as closely as practical.

The screenshot supplied in the same handoff conversation is the **Master Design / Design Contract**. Do not redesign it into another visual language.

## Repository / scope
- Repository: `nichakulp-create/PANDT-BOS-WEB`
- Task branch: `codex/ceo-dashboard-master-reference`
- Primary implementation file today: `index.html`
- Preserve existing Supabase/auth/data contracts and business logic unless a UI hook must be adapted.
- Do not modify source business data.
- Do not fabricate company values when data is missing.

## Visual contract
Target visual hierarchy and composition from the reference:

### A. Full-screen shell
- Desktop CEO page must use the full viewport.
- Target: `100vw x 100vh`.
- **No page-level vertical scroll and no horizontal scroll** at normal desktop resolutions (1366x768, 1440x900, 1920x1080).
- Dense but readable executive control-room layout.
- Dark navy/blue industrial theme with cyan/blue highlights, amber for selected/attention, green positive, red risk.
- Thai-first labels; English only for technical/business terms.
- Avoid the current “Minecraft/block” look: use controlled borders, subtle gradients, coherent spacing, real charts and hierarchy.

### B. Header
Match the screenshot:
- Left: large P&T mark + `SMART BOS` + small `Business Operating System`.
- Beside it: `Executive Control Tower`.
- Compact navigation: CEO, Sales, Production, Inventory, Quality, Purchase, Cost, Finance, AI Manager.
- Filters at right: month, customer, process (or equivalent current filter contract).
- Live/data status.
- Header must stay within the single-screen layout.

### C. KPI strip
Eight compact cards in one row:
1. Sales Actual
2. Open Order
3. Forecast
4. Working Capital
5. Total Cost
6. Gross Margin
7. OTD / On-Time Delivery
8. OEE / Quality

Each card should follow the screenshot:
- icon
- Thai label + compact English subtitle
- main value
- delta vs prior period
- micro sparkline
- clickable detail affordance
- selected card gets amber focus/outline, not a heavy block.

### D. Main dashboard grid
Use the reference proportions. Required panels:

1. **Revenue Funnel**
   - Forecast → Order → Shipped → Actual Sales
   - Four vertical bars/steps with values and conversion deltas.
   - Click each stage for detail.

2. **Money in Process**
   - Raw Material → WIP → Fac2 → QA → FG
   - Monetary value and share for each stage.
   - Show total working capital.
   - Click each stage.

3. **AI Manager**
   - Priority list 1–5.
   - Severity/Opportunity colors.
   - Concise title, impact and context.
   - Click opens the relevant evidence/detail.

4. **Cost & Anomaly**
   - Monthly cost chart with anomaly markers.
   - Top 3 anomaly list underneath.
   - Drill-down to item/supplier/category.

5. **Order Status**
   - Donut/ring summary.
   - On-Time / At Risk / Overdue / Cancelled.
   - Urgent Orders table below.

6. **KPI & Data Confidence**
   - KPI status list.
   - On Track / Watch / Risk.
   - Data Confidence ring and per-domain confidence.

### E. Detail drawer
The previous CEO requirement overrides the screenshot width:
- Clicking KPI/panel/chart/list row opens a **right-side detail drawer at 75% viewport width on desktop**.
- Dashboard context remains visible at left.
- On tablet/mobile, use 100% width.
- Drawer tabs:
  1. ภาพรวม
  2. รายละเอียดแต่ละส่วน
  3. แนวโน้ม
  4. AI Insight
- Use the Working Capital drawer shown in the reference as the interaction model:
  - headline metric
  - ratio/target
  - process breakdown table
  - trend chart
  - AI Insight
- Drawer must be scrollable internally if needed; page body should not scroll.

## Data/business constraints
- Actual Sales: authoritative financial actual should remain based on current approved sales actual source/contract, not inferred solely from stock movement.
- Shipment/FG movement may be used as operational evidence and reconciliation.
- Working Capital stages must not double-count QA/FG.
- Do not silently use sales price as inventory cost basis unless current logic explicitly defines it.
- Missing/uncertain values show `—`, not zero.
- Keep data confidence visible when a metric is incomplete.
- Preserve existing current source/read-only behavior.

## Interaction requirements
- Every KPI card is clickable.
- Revenue Funnel stages are clickable.
- Money in Process stages are clickable.
- AI Manager items are clickable.
- Cost anomalies are clickable.
- Order rows are clickable.
- KPI/Data Confidence items are clickable.
- Hover/focus states must be clear but subtle.
- Keyboard focus must remain usable.

## Responsive behavior
Desktop is the primary target and must match the screenshot.
- >= 1280px: one-screen dashboard, no body scroll.
- Tablet: adaptive grid; drawer 100%.
- Mobile: stacked layout may scroll; preserve usability.

## Performance
- Avoid heavy re-render loops and duplicate data fetches.
- Reuse already available data/state.
- Do not add paid APIs.
- Keep initial dashboard render fast.
- Avoid unnecessary dependencies; this repository currently ships as a self-contained web page.

## Acceptance criteria — do not mark complete until all pass
1. Visual structure clearly matches the supplied reference screenshot.
2. Desktop has no body horizontal/vertical scroll at 1366x768 and 1920x1080.
3. All eight KPI cards fit in one row at desktop widths.
4. Main panels fit in the viewport with proportions close to reference.
5. Detail drawer measures approximately 75% of viewport width on desktop.
6. Every primary card/panel opens meaningful detail.
7. Missing data is not fabricated.
8. Existing login/Supabase data flow remains functional.
9. Browser console has no errors.
10. Existing business calculations are not silently changed.
11. Selected state/hover/focus are polished and professional.
12. Final result should look like an industrial executive control center, **not a grid of generic blocks**.

## Implementation guidance
- Prefer targeted refactor of the existing CEO-specific CSS/markup over rewriting unrelated application areas.
- Existing `body.ceo-dashboard` styles can be consolidated instead of layering more conflicting overrides.
- Remove/replace obsolete duplicate CEO CSS where it causes cascade conflicts.
- Keep non-CEO app screens stable.
- If necessary, introduce small helper render functions in the existing script section, but do not turn this into a framework migration.

## Deliverable
Commit the implementation to `codex/ceo-dashboard-master-reference` and summarize:
- files changed
- data logic preserved/changed
- viewport tests performed
- drawer width test
- known gaps vs reference
