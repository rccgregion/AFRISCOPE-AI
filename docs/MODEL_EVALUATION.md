# Model and optimisation evaluation

Reproduce with `npm run evaluate`; machine-readable output is `evaluations/results.json`. All inputs are synthetic, seed 20260930, reference date 2026-09-30. No external model was called.

## Forecast protocol

48 facility–medicine weekly series, 52 observations each. Chronological split: first 70% training, next 15% validation, final 15% test. Candidates: four-week moving average and exponential smoothing (α=0.3). Validation MAE selects the displayed series model; both candidates are reported on the untouched test segment. Predictions update only with prior observed values. Four future weeks are recursively forecast after the observed history.

Metrics: MAE in declared units/week; WAPE = sum absolute error / sum actual (null if actual sum is zero); bias = mean(predicted − actual), so positive means overprediction. The displayed 80% envelope uses validation absolute-residual quantiles and is **not a calibrated prediction interval**.

| Held-out method             | Predictions |     MAE |    WAPE |     Bias |
| --------------------------- | ----------: | ------: | ------: | -------: |
| Moving average (4 weeks)    |         432 | 38.3999 | 0.17150 | +15.0828 |
| Exponential smoothing α=0.3 |         432 | 37.0094 | 0.16529 | +10.5260 |

These results describe the synthetic generator only. Stockouts censor observed consumption; it is not uncensored demand. No real-world accuracy, clinical benefit, or causal claim follows. Seasonal, hierarchical, causal, and stockout-aware models remain future work.

## Inventory and finance

The fresh medicine snapshot has 48 facility–medicine records across 12 facilities, three critical-risk records, and three candidate redistribution opportunities. Calculations do not mutate stock. Donor stock is reserved across proposals; transfers require same country/product/unit, transit/expiry feasibility, and donor reserve. Finance keeps NGN and KES separate and retains an unmatched payment in currency totals while excluding it from programme attribution.

## Allocation

Eight indivisible synthetic packages; exact exhaustive search evaluates 256 combinations. Objective: maximise assumed reach, then minimise cost. Constraints include budget, dependencies, required options/geographies, equity minimum, and delivery duration. Budgets USD 90,000 / 160,000 / 230,000 are feasible; infeasible cases return reasons rather than a fabricated portfolio. Reach may overlap and is not a verified health effect. Exhaustive search is limited to 16 options; larger problems require a tested solver.

## Defect fixture

Eight input rows → eight rejected, zero accepted, no stock mutation and no replacement analytical version. Unit/integration tests also cover balance identities, zero demand, expiry/reserve constraints, mixed-currency rejection, chronological evaluation, dependency cycles, and infeasibility.
