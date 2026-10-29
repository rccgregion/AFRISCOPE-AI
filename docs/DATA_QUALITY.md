# Data quality and ingestion

## Supported imports

CSV and XLSX for inventory, budgets, funding releases, procurement events, and expenditure records. Limits: CSV 5 MB, XLSX 2 MB, 5,000 rows, 80 columns; XLSX central-directory uncompressed total above 20 MB is rejected. Parsing and validation happen server-side. Preview does not mutate analytical facts.

## Workflow

1. Select schema and upload.
2. Map every required field to a distinct source column.
3. Review source preview and dataset name.
4. Commit: validate required values, types, dates, units, references, balances, currencies, and business keys.
5. Accepted rows create an immutable version. Rejected rows remain in the import job with source row, field, reason, and original values. A fully rejected import creates no version.
6. Recalculate the relevant analysis to use the new version. Existing evidence/reports retain earlier source references.

## Inventory rules

- `closing = opening + received - dispensed + adjustments`.
- `usable + reserved + expired <= closing`.
- Non-negative quantities except signed adjustments; weekly stockout days 0–7; minimum stock ≤ maximum stock.
- Facility and medicine must exist in the project; units must match the medicine master.
- Expiry before reporting date is rejected for resolution rather than silently treated as usable.
- Duplicate facility/medicine/date/batch keys within an import are rejected and retained.
- Coverage uses usable stock and reliable historical consumption; zero/missing/unreliable demand yields no estimate.

## Finance rules

Amounts use non-negative decimal major units with at most two decimals, converted to integer cents without floating-point accumulation. Currency is explicit. Linked budget currency and programme must match. Released funds require a release date. Unsupported expenditure event types are rejected. No FX conversion is performed.

## Quality report semantics

Completeness is measured per required field; validity is accepted/inspected rows. Issues group rejected records by field/reason with examples and remediation. Timeliness reports latest available record against the reference date. **Accuracy is not verifiable without a trusted external operational reference.** Structural conformity is not a fairness, legal, or real-world accuracy certification.

## Fixtures

`public/demo/inventory_defects.csv` contains eight intentionally defective rows, separate from clean analytical fixtures. It exercises missing/negative/inconsistent values, incompatible units, unknown references, and duplicate keys. Download the rejection CSV after import to inspect retained evidence. Clean seeded results never include the defect fixture.
