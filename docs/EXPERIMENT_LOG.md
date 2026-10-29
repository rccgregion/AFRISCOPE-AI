# Reproducible experiment log

## Protocol

- Data: fixed synthetic seed 20260930; reference date 2026-09-30; clean fixtures separate from defect fixture.
- Environment: Node 22, TypeScript analytics version 1.0; embedded PostgreSQL for local evaluation.
- Command: `npm run evaluate` (fresh in-memory database, deterministic seed, no external LLM).
- Forecast: chronological 70/15/15; MA(4) versus SES(0.3); validation-only selection; held-out MAE/WAPE/bias.
- Allocation: exact binary selection over eight packages; budgets 90k/160k/230k USD; explicit constraints and assumed outcomes.
- AI: local deterministic explanation; eight narrow grounding/refusal regressions; external provider disabled.

## Recorded findings

The latest machine-readable run is `evaluations/results.json`; it includes start/completion timestamps and runtime versions. Held-out SES MAE 37.0094 versus MA 38.3999; WAPE 0.16529 versus 0.17150. Both overpredict on average. Eight defect rows are all rejected. Local safety-pattern regressions pass 8/8. These are synthetic regression results, not real-world effectiveness.

## In-app experiments

Forecast-comparison and threshold-comparison experiments execute synchronously and persist configuration, run duration, result, and per-method metrics. Unsupported external-model experiment templates remain explicitly unexecuted illustrations. No cost is invented (`null`). Run history and results are immutable for the application role.

## Engineering iteration notes

The implementation added database-level tenant/reference checks after API tests; corrected finance aggregation to include unmatched expenditures in currency totals but not programme attribution; reserved donor stock across proposals; fixed inventory-domain assistant retrieval; prevented fully rejected imports from creating empty replacement versions; wired approval-row review dialogs; and improved contrast after axe scans. E2E tests run against the production build to avoid development websocket noise.

## Reproduction checklist

1. `npm ci`
2. `npm run data:generate` (optional; committed fixtures should be unchanged)
3. `npm run demo:reset -- --confirm-demo-reset`
4. `npm test`
5. `npm run evaluate`
6. `npx playwright install chromium && npm run test:e2e`

Do not compare timings across machines as productivity evidence. No human timed baseline or live LLM run was performed.
