# Getting real data into AfriScope

This guide covers the supported path for bringing **real** facility and stock
data into a workspace. It is deliberately strict: a row is either accepted with
a recorded source or rejected with a reason. Nothing is coerced, guessed, or
silently dropped.

## 1. Who can import

| Role | Can import real data | Can clear / restore sample data |
| --- | --- | --- |
| Data analyst | Yes (`data` permission) | No |
| Programme manager | Yes (`data` permission) | No |
| Organisation administrator | Yes | Yes |
| Platform administrator | Yes | Yes |
| Operator, reviewer, executive | No (read-only for data) | No |

Import, preview, undo and manual entry all require the `data` permission on the
project. Clearing and restoring require the `manage` permission **and** an
organisation administrator role. Attempts from other roles return HTTP 403.

## 2. Templates

Download from the app (`/api/import-templates/facilities`, `/api/import-templates/stock`)
or from `Administration → Import real data`. The templates contain a header row
and one clearly-labelled example row whose values are placeholders
(`YOUR-FACILITY-ID`, `Your facility name`). They contain **no** real or
realistic invented facility data. The field documentation is also served as JSON
at `/api/import-templates/<kind>?format=json` for the XLSX data-dictionary sheet.

### Facilities file

| Field | Required | Rules |
| --- | --- | --- |
| `facility_id` | yes | Unique within the file; stable identifier from the source |
| `facility_name` | yes | Name as published by the source |
| `country` | no | Used to check coordinates |
| `state_or_region` | no | |
| `district_or_lga` | no | |
| `facility_type` | no | |
| `catchment_population` | no | Number ≥ 0 |
| `lat` | no | −90…90; supply with `lon` or not at all |
| `lon` | no | −180…180 |
| `source` | **yes** | Registry, report or system the row came from |

### Stock and signals file

| Field | Required | Rules |
| --- | --- | --- |
| `facility_id` | yes | Must exist in the workspace or in the same batch |
| `medicine` | yes | Medicine name |
| `usable_stock_units` | yes | Number ≥ 0, expired/unusable stock excluded |
| `avg_daily_consumption` | yes | Number ≥ 0 |
| `as_of_date` | yes | `YYYY-MM-DD`, not in the future |
| `financing_signal` | no | Free text exactly as recorded |
| `reporting_period` | no | Label, e.g. `2026-Q3` |
| `source` | **yes** | Registry, report or system the row came from |

## 3. Validation rules (rejections, not fixes)

A row is rejected when:

- `facility_id` or `facility_name` is missing (facilities), or `facility_id`,
  `medicine`, `usable_stock_units`, `avg_daily_consumption`, `as_of_date` or
  `source` is missing (stock);
- `facility_id` appears twice in the same facilities file (the first occurrence
  is kept, later ones are reported);
- a stock row references a `facility_id` that is neither in the workspace nor in
  the facilities file uploaded in the same batch;
- a stock or consumption value is non-numeric or negative;
- `as_of_date` is not a valid date or is in the future;
- coordinates are out of range, or outside the stated country's bounding box.

Warnings (accepted, but reported) include identical coordinates on two different
facilities — usually a copy/paste artefact in the source file.

`coverage_days` is **always** computed as `usable_stock_units / avg_daily_consumption`.
A supplied value is never trusted; the import stores the computed value and the
supplied value (`supplied_coverage_days`) with a `coverage_mismatch` flag.

## 4. Duplicates on `(facility_id, medicine, as_of_date)`

Chosen per batch, before commit:

- **Reject and report** (default) — the whole row is reported as a rejection;
- **Skip** — the new row is not written, the existing reading is kept;
- **Update** — the existing reading is replaced by the new one.

## 5. The wizard

1. **Upload** the facilities CSV and/or the stock CSV.
2. **Map** columns. Headers are matched automatically and can be edited in the
   preview step. Unmapped required columns block the commit.
3. **Validate** — `/real-import/preview` returns valid / warning / rejected
   counts with a reason for every rejected row. Nothing is written.
4. **Preview** shows the accepted rows with their computed coverage.
5. **Commit** — `/real-import/commit` re-validates the same upload, writes the
   rows with `data_origin='real'`, and records a lineage batch.

### What the commit records

- a `data_import_batches` row: file name, uploader, timestamp, batch id, row
  counts, rejection count, duplicate policy;
- a `datasets` + `dataset_versions` pair pointing at the batch;
- `facilities.source`, `facilities.import_batch_id`,
  `inventory_records.source`, `inventory_records.import_batch_id`.

Every real-data view then shows `Source: <source>, as of <date>`.

## 6. Undo

`POST /api/import-batches/:id/undo` (organisation administrator or manager)
removes exactly the rows written by that batch — nothing else — marks the batch
`undone_at`, and writes an audit entry `real_import.undone`. Sample rows and other
batches are untouched.

## 7. Manual entry

`POST /api/projects/:id/manual-entry` writes one facility and/or one stock
reading using the same validation. The `source` is recorded as
`manual entry (<user name>)` so the provenance of a hand-typed row is never lost.

## 8. Clearing and restoring sample data

`Administration → Data origin and sample data`:

1. **Preview what would be removed** — a dry run lists, per table, the number of
   sample rows that would be deleted and the number of real rows that would be
   kept. Nothing is deleted by the preview.
2. **Type `CLEAR SAMPLE DATA`** to enable the destructive button.
3. **Clear** — runs in one transaction, takes an advisory lock, deletes only
   `data_origin='sample'` rows (children before parents), writes an audit entry
   `sample_data.cleared`, and keeps projects and audit history so every module
   still renders.
4. If any **real** row references a sample row, the whole operation aborts and
   names the blocker. Real rows are never deleted.
5. **Restore sample data** re-seeds the labelled sample pack idempotently; row
   counts after a restore equal the counts before a clear.

## 9. Feature flags

| Flag | Default | Effect |
| --- | --- | --- |
| `SAMPLE_DATA_CONTROLS` | `true` | Enables the dry-run, clear and restore endpoints |
| `SAMPLE_DATA_RESTORE` | `false` | Enables the restore endpoint in production; set to `true` to allow a re-seed |

## 10. What this build does not do

- It does not fetch data from DHIS2, OpenLMIS, NHIA, BHCPF or any other external
  system. Every real row comes from a file a named user uploaded or typed.
- It does not convert currencies or combine units. Amounts stay in the currency
  recorded on the row.
- It does not verify that a source file is truthful. Provenance is recorded, not
  certified.
