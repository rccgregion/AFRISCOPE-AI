# Data dictionary

Generated from `server/schema.mjs` plus core migration and import definitions. Regenerate with `node scripts/generate_dictionary.mjs`. All demonstration values are synthetic.

## Conventions

UUID primary keys; `organisation_id` and `project_id` enforce tenant scope; `created_by` references the actor; timestamps are PostgreSQL `timestamptz`. JSONB documents are schema-validated at API boundaries where writable. Financial facts use integer cents and explicit currency; inventory quantities use the medicine master unit. Immutable tables have no application-role UPDATE policy.

## Core identity and access tables

| Table                    | Purpose                                                   | Key fields                                                          |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------- |
| organisations            | Tenant boundary and demo marker                           | id, name, is_demo, settings                                         |
| user_profiles            | Account identity; password hash never exposed to app role | id, email, full_name, password_hash, is_platform_admin, preferences |
| organisation_memberships | Organisation role                                         | organisation_id, user_id, role; unique membership                   |
| projects                 | Decision workspace                                        | organisation_id, title, sector, countries, settings, created_by     |
| project_memberships      | Project role override                                     | project_id, user_id, role; unique membership                        |
| auth_sessions            | Hashed opaque sessions                                    | token_hash, user_id, expires_at                                     |
| auth_throttle            | Login attempt window                                      | key, attempts, reset_at                                             |
| invitations              | Single-use email-bound invitation                         | organisation_id, email, role, token_hash, expires_at, accepted_at   |
| schema_migrations        | Applied forward migrations                                | version, applied_at                                                 |

## Domain tables

### stakeholders

Permission group: `manage`.

| Field     | PostgreSQL definition |
| --------- | --------------------- |
| name      | `text not null`       |
| role      | `text`                |
| influence | `text`                |
| interest  | `text`                |
| notes     | `text`                |

### problem_briefs

Permission group: `manage`.

| Field     | PostgreSQL definition           |
| --------- | ------------------------------- |
| title     | `text not null`                 |
| version   | `integer not null default 1`    |
| status    | `text not null default 'Draft'` |
| content   | `jsonb not null default '{}'`   |
| parent_id | `uuid`                          |

### requirements_documents

Permission group: `manage`.

| Field     | PostgreSQL definition           |
| --------- | ------------------------------- |
| title     | `text not null`                 |
| version   | `integer not null default 1`    |
| status    | `text not null default 'Draft'` |
| content   | `jsonb not null default '{}'`   |
| parent_id | `uuid`                          |

### datasets

Permission group: `data`.

| Field               | PostgreSQL definition                      |
| ------------------- | ------------------------------------------ |
| name                | `text not null`                            |
| description         | `text`                                     |
| source              | `text`                                     |
| owner               | `text`                                     |
| sensitivity         | `text not null default 'Synthetic public'` |
| quality_status      | `text not null default 'Pending'`          |
| reporting_period    | `text`                                     |
| geographic_coverage | `text`                                     |
| schema_version      | `text not null default '1.0'`              |
| lineage             | `text`                                     |
| access_policy       | `text not null default 'Project members'`  |
| kind                | `text not null`                            |

### dataset_versions

Permission group: `data` · immutable.

| Field        | PostgreSQL definition                                     |
| ------------ | --------------------------------------------------------- |
| dataset_id   | `uuid not null references datasets(id) on delete cascade` |
| version      | `integer not null`                                        |
| row_count    | `integer not null default 0`                              |
| checksum     | `text not null`                                           |
| period_start | `date`                                                    |
| period_end   | `date`                                                    |
| notes        | `text`                                                    |
| unique       | `(dataset_id, version)`                                   |

### data_import_jobs

Permission group: `data`.

| Field          | PostgreSQL definition                                     |
| -------------- | --------------------------------------------------------- |
| dataset_id     | `uuid references datasets(id) on delete set null`         |
| version_id     | `uuid references dataset_versions(id) on delete set null` |
| filename       | `text not null`                                           |
| kind           | `text not null`                                           |
| status         | `text not null`                                           |
| mapping        | `jsonb not null default '{}'`                             |
| preview_rows   | `jsonb not null default '[]'`                             |
| columns        | `jsonb not null default '[]'`                             |
| accepted_count | `integer not null default 0`                              |
| rejected_count | `integer not null default 0`                              |
| rejections     | `jsonb not null default '[]'`                             |
| error          | `text`                                                    |

### data_quality_results

Permission group: `data`.

| Field       | PostgreSQL definition                                             |
| ----------- | ----------------------------------------------------------------- |
| dataset_id  | `uuid not null references datasets(id) on delete cascade`         |
| version_id  | `uuid not null references dataset_versions(id) on delete cascade` |
| metrics     | `jsonb not null default '{}'`                                     |
| issues      | `jsonb not null default '[]'`                                     |
| limitations | `jsonb not null default '[]'`                                     |

### data_dictionary_entries

Permission group: `data`.

| Field           | PostgreSQL definition                                     |
| --------------- | --------------------------------------------------------- |
| dataset_id      | `uuid not null references datasets(id) on delete cascade` |
| field_name      | `text not null`                                           |
| definition      | `text`                                                    |
| data_type       | `text`                                                    |
| unit            | `text`                                                    |
| required        | `boolean default false`                                   |
| allowed_values  | `text`                                                    |
| validation_rule | `text`                                                    |
| example         | `text`                                                    |
| source          | `text`                                                    |
| sensitivity     | `text`                                                    |
| relationships   | `text`                                                    |

### analytical_runs

Permission group: `data` · immutable.

| Field              | PostgreSQL definition                                     |
| ------------------ | --------------------------------------------------------- |
| kind               | `text not null`                                           |
| method             | `text not null`                                           |
| method_version     | `text not null`                                           |
| configuration      | `jsonb not null default '{}'`                             |
| status             | `text not null`                                           |
| result             | `jsonb not null default '{}'`                             |
| duration_ms        | `numeric`                                                 |
| dataset_version_id | `uuid references dataset_versions(id) on delete set null` |

### models

Permission group: `data`.

| Field               | PostgreSQL definition                     |
| ------------------- | ----------------------------------------- |
| name                | `text not null`                           |
| purpose             | `text`                                    |
| intended_users      | `text`                                    |
| intended_use        | `text`                                    |
| prohibited_use      | `text`                                    |
| inputs              | `text`                                    |
| owner               | `text`                                    |
| risk_classification | `text not null default 'Review required'` |
| review_date         | `date`                                    |
| limitations         | `text`                                    |

### model_versions

Permission group: `data`.

| Field         | PostgreSQL definition                                   |
| ------------- | ------------------------------------------------------- |
| model_id      | `uuid not null references models(id) on delete cascade` |
| version       | `text not null`                                         |
| method        | `text`                                                  |
| configuration | `jsonb not null default '{}'`                           |
| evaluation    | `jsonb not null default '{}'`                           |
| status        | `text not null default 'Candidate'`                     |

### experiments

Permission group: `data`.

| Field               | PostgreSQL definition                                     |
| ------------------- | --------------------------------------------------------- |
| name                | `text not null`                                           |
| objective           | `text`                                                    |
| hypothesis          | `text`                                                    |
| dataset_version_id  | `uuid references dataset_versions(id) on delete set null` |
| method              | `text`                                                    |
| model_version       | `text`                                                    |
| prompt_template     | `text`                                                    |
| configuration       | `jsonb not null default '{}'`                             |
| evaluation_criteria | `text`                                                    |
| expected_outcome    | `text`                                                    |
| actual_outcome      | `text`                                                    |
| limitations         | `text`                                                    |
| conclusions         | `text`                                                    |
| next_steps          | `text`                                                    |
| decision            | `text`                                                    |
| status              | `text not null default 'Draft'`                           |
| owner               | `text`                                                    |

### experiment_runs

Permission group: `data` · immutable.

| Field         | PostgreSQL definition                                        |
| ------------- | ------------------------------------------------------------ |
| experiment_id | `uuid not null references experiments(id) on delete cascade` |
| status        | `text not null`                                              |
| configuration | `jsonb not null default '{}'`                                |
| result        | `jsonb not null default '{}'`                                |
| duration_ms   | `numeric`                                                    |
| cost          | `numeric`                                                    |
| failure_cases | `jsonb not null default '[]'`                                |
| executed_at   | `timestamptz not null default now()`                         |

### experiment_results

Permission group: `data` · immutable.

| Field     | PostgreSQL definition                                            |
| --------- | ---------------------------------------------------------------- |
| run_id    | `uuid not null references experiment_runs(id) on delete cascade` |
| test_case | `text not null`                                                  |
| input     | `jsonb not null default '{}'`                                    |
| output    | `jsonb not null default '{}'`                                    |
| metrics   | `jsonb not null default '{}'`                                    |
| passed    | `boolean`                                                        |

### evidence_records

Permission group: `data` · immutable.

| Field            | PostgreSQL definition                                    |
| ---------------- | -------------------------------------------------------- |
| question         | `text not null`                                          |
| method           | `text not null`                                          |
| method_version   | `text not null`                                          |
| result           | `jsonb not null`                                         |
| assumptions      | `jsonb not null default '[]'`                            |
| limitations      | `jsonb not null default '[]'`                            |
| source_versions  | `jsonb not null default '[]'`                            |
| reporting_period | `text`                                                   |
| freshness        | `text`                                                   |
| classification   | `text not null default 'Computed result'`                |
| run_id           | `uuid references analytical_runs(id) on delete set null` |

### recommendations

Permission group: `manage`.

| Field               | PostgreSQL definition               |
| ------------------- | ----------------------------------- |
| title               | `text not null`                     |
| problem             | `text`                              |
| proposed_action     | `jsonb not null default '{}'`       |
| expected_benefit    | `text`                              |
| risks               | `jsonb not null default '[]'`       |
| assumptions         | `jsonb not null default '[]'`       |
| limitations         | `jsonb not null default '[]'`       |
| state               | `text not null default 'Draft'`     |
| owner_id            | `uuid references user_profiles(id)` |
| review_date         | `timestamptz`                       |
| evidence_ids        | `jsonb not null default '[]'`       |
| implementation_note | `text`                              |
| outcome             | `text`                              |

### recommendation_evidence

Permission group: `manage` · immutable.

| Field             | PostgreSQL definition                                              |
| ----------------- | ------------------------------------------------------------------ |
| recommendation_id | `uuid not null references recommendations(id) on delete cascade`   |
| evidence_id       | `uuid not null references evidence_records(id) on delete restrict` |
| unique            | `(recommendation_id,evidence_id)`                                  |

### approvals

Permission group: `approve` · immutable.

| Field             | PostgreSQL definition                                             |
| ----------------- | ----------------------------------------------------------------- |
| recommendation_id | `uuid not null references recommendations(id) on delete restrict` |
| decision          | `text not null`                                                   |
| reason            | `text not null`                                                   |
| reviewer_id       | `uuid not null references user_profiles(id)`                      |
| original_action   | `jsonb not null`                                                  |
| final_action      | `jsonb not null`                                                  |
| evidence_snapshot | `jsonb not null`                                                  |
| override          | `boolean not null default false`                                  |

### operational_alerts

Permission group: `operate`.

| Field                | PostgreSQL definition                  |
| -------------------- | -------------------------------------- |
| category             | `text not null`                        |
| severity             | `text not null`                        |
| title                | `text not null`                        |
| triggering_condition | `text not null`                        |
| source_records       | `jsonb not null default '[]'`          |
| evidence_id          | `uuid references evidence_records(id)` |
| owner_id             | `uuid references user_profiles(id)`    |
| status               | `text not null default 'Open'`         |
| recommended_action   | `text`                                 |
| dedupe_key           | `text not null`                        |
| resolved_note        | `text`                                 |
| unique               | `(project_id,dedupe_key)`              |

### action_items

Permission group: `operate`.

| Field             | PostgreSQL definition                                       |
| ----------------- | ----------------------------------------------------------- |
| title             | `text not null`                                             |
| description       | `text`                                                      |
| owner_id          | `uuid references user_profiles(id)`                         |
| due_date          | `date`                                                      |
| status            | `text not null default 'Open'`                              |
| priority          | `text not null default 'Medium'`                            |
| alert_id          | `uuid references operational_alerts(id) on delete set null` |
| recommendation_id | `uuid references recommendations(id) on delete set null`    |

### budgets

Permission group: `data`.

| Field          | PostgreSQL definition                                             |
| -------------- | ----------------------------------------------------------------- |
| version_id     | `uuid not null references dataset_versions(id) on delete cascade` |
| source_row     | `integer`                                                         |
| programme_code | `text not null`                                                   |
| programme_name | `text not null`                                                   |
| funding_source | `text`                                                            |
| currency       | `text not null`                                                   |
| period         | `text not null`                                                   |
| amount_cents   | `bigint not null check(amount_cents >= 0)`                        |
| geography      | `text`                                                            |
| external_id    | `text not null`                                                   |
| unique         | `(project_id,external_id,version_id)`                             |

### funding_releases

Permission group: `data`.

| Field         | PostgreSQL definition                                             |
| ------------- | ----------------------------------------------------------------- |
| version_id    | `uuid not null references dataset_versions(id) on delete cascade` |
| source_row    | `integer`                                                         |
| budget_id     | `uuid not null references budgets(id) on delete restrict`         |
| external_id   | `text not null`                                                   |
| currency      | `text not null`                                                   |
| amount_cents  | `bigint not null check(amount_cents >= 0)`                        |
| due_date      | `date not null`                                                   |
| released_date | `date`                                                            |
| status        | `text not null`                                                   |
| period        | `text not null`                                                   |
| unique        | `(project_id,external_id,version_id)`                             |

### procurement_events

Permission group: `data`.

| Field              | PostgreSQL definition                                             |
| ------------------ | ----------------------------------------------------------------- |
| version_id         | `uuid not null references dataset_versions(id) on delete cascade` |
| source_row         | `integer`                                                         |
| programme_code     | `text not null`                                                   |
| external_id        | `text not null`                                                   |
| title              | `text not null`                                                   |
| stage              | `text not null`                                                   |
| currency           | `text not null`                                                   |
| amount_cents       | `bigint not null check(amount_cents >= 0)`                        |
| started_date       | `date`                                                            |
| due_date           | `date`                                                            |
| completed_date     | `date`                                                            |
| expected_days      | `integer not null check(expected_days >= 0)`                      |
| supplier           | `text`                                                            |
| approval_reference | `text`                                                            |
| unique             | `(project_id,external_id,version_id)`                             |

### expenditure_records

Permission group: `data`.

| Field            | PostgreSQL definition                                             |
| ---------------- | ----------------------------------------------------------------- |
| version_id       | `uuid not null references dataset_versions(id) on delete cascade` |
| source_row       | `integer`                                                         |
| programme_code   | `text not null`                                                   |
| budget_id        | `uuid references budgets(id) on delete restrict`                  |
| external_id      | `text not null`                                                   |
| event_type       | `text not null`                                                   |
| currency         | `text not null`                                                   |
| amount_cents     | `bigint not null check(amount_cents >= 0)`                        |
| transaction_date | `date not null`                                                   |
| period           | `text not null`                                                   |
| reference        | `text`                                                            |
| description      | `text`                                                            |
| unique           | `(project_id,external_id,version_id)`                             |

### facilities

Permission group: `data`.

| Field         | PostgreSQL definition      |
| ------------- | -------------------------- |
| external_id   | `text not null`            |
| name          | `text not null`            |
| country       | `text not null`            |
| region        | `text not null`            |
| district      | `text not null`            |
| facility_type | `text not null`            |
| latitude      | `numeric`                  |
| longitude     | `numeric`                  |
| unique        | `(project_id,external_id)` |

### medicine_products

Permission group: `data`.

| Field            | PostgreSQL definition         |
| ---------------- | ----------------------------- |
| external_id      | `text not null`               |
| name             | `text not null`               |
| unit             | `text not null`               |
| minimum_days     | `integer not null default 14` |
| near_expiry_days | `integer not null default 60` |
| unique           | `(project_id,external_id)`    |

### inventory_records

Permission group: `data` · immutable.

| Field              | PostgreSQL definition                                               |
| ------------------ | ------------------------------------------------------------------- |
| version_id         | `uuid not null references dataset_versions(id) on delete cascade`   |
| facility_id        | `uuid not null references facilities(id) on delete restrict`        |
| product_id         | `uuid not null references medicine_products(id) on delete restrict` |
| reporting_date     | `date not null`                                                     |
| opening_stock      | `integer not null check(opening_stock >= 0)`                        |
| quantity_received  | `integer not null check(quantity_received >= 0)`                    |
| quantity_dispensed | `integer not null check(quantity_dispensed >= 0)`                   |
| adjustments        | `integer not null default 0`                                        |
| closing_stock      | `integer not null check(closing_stock >= 0)`                        |
| usable_stock       | `integer not null check(usable_stock >= 0)`                         |
| reserved_stock     | `integer not null check(reserved_stock >= 0)`                       |
| expired_stock      | `integer not null check(expired_stock >= 0)`                        |
| stockout_days      | `integer not null check(stockout_days between 0 and 7)`             |
| expiry_date        | `date`                                                              |
| batch_identifier   | `text`                                                              |
| minimum_stock      | `integer not null check(minimum_stock >= 0)`                        |
| maximum_stock      | `integer not null check(maximum_stock >= minimum_stock)`            |
| quality_status     | `text not null default 'Validated'`                                 |
| source_row         | `integer not null`                                                  |
| country            | `text`                                                              |
| supplier           | `text`                                                              |
| check              | `(usable_stock + reserved_stock + expired_stock <= closing_stock)`  |

### consumption_records

Permission group: `data` · immutable.

| Field        | PostgreSQL definition                                               |
| ------------ | ------------------------------------------------------------------- |
| version_id   | `uuid not null references dataset_versions(id) on delete cascade`   |
| facility_id  | `uuid not null references facilities(id) on delete restrict`        |
| product_id   | `uuid not null references medicine_products(id) on delete restrict` |
| period_start | `date not null`                                                     |
| period_end   | `date not null`                                                     |
| quantity     | `integer not null check(quantity >= 0)`                             |
| unit         | `text not null`                                                     |
| source_row   | `integer`                                                           |

### deliveries

Permission group: `data`.

| Field          | PostgreSQL definition                                               |
| -------------- | ------------------------------------------------------------------- |
| facility_id    | `uuid not null references facilities(id) on delete restrict`        |
| product_id     | `uuid not null references medicine_products(id) on delete restrict` |
| external_id    | `text not null`                                                     |
| expected_date  | `date not null`                                                     |
| quantity       | `integer not null check(quantity > 0)`                              |
| unit           | `text not null`                                                     |
| lead_time_days | `integer not null check(lead_time_days >= 0)`                       |
| status         | `text not null`                                                     |
| received_date  | `date`                                                              |
| unique         | `(project_id,external_id)`                                          |

### intervention_options

Permission group: `manage`.

| Field                 | PostgreSQL definition                               |
| --------------------- | --------------------------------------------------- |
| name                  | `text not null`                                     |
| target_population     | `text`                                              |
| geography             | `text not null`                                     |
| cost_cents            | `bigint not null check(cost_cents > 0)`             |
| currency              | `text not null default 'USD'`                       |
| unit_cost_cents       | `bigint check(unit_cost_cents > 0)`                 |
| expected_outcome      | `integer not null check(expected_outcome >= 0)`     |
| outcome_unit          | `text not null default 'People reached'`            |
| evidence_source       | `text`                                              |
| evidence_quality      | `text not null default 'Synthetic assumption'`      |
| capacity              | `integer not null check(capacity > 0)`              |
| implementation_months | `integer not null check(implementation_months > 0)` |
| constraints           | `text`                                              |
| equity_group          | `text`                                              |
| dependencies          | `jsonb not null default '[]'`                       |
| is_assumption         | `boolean not null default true`                     |

### optimisation_scenarios

Permission group: `manage`.

| Field             | PostgreSQL definition                                    |
| ----------------- | -------------------------------------------------------- |
| name              | `text not null`                                          |
| version           | `integer not null default 1`                             |
| parent_id         | `uuid`                                                   |
| currency          | `text not null default 'USD'`                            |
| budget_cents      | `bigint not null check(budget_cents >= 0)`               |
| constraints       | `jsonb not null default '{}'`                            |
| option_snapshot   | `jsonb not null default '[]'`                            |
| result            | `jsonb not null default '{}'`                            |
| status            | `text not null default 'Draft'`                          |
| recommendation_id | `uuid references recommendations(id) on delete set null` |

### learning_modules

Permission group: `admin`.

| Field            | PostgreSQL definition           |
| ---------------- | ------------------------------- |
| pathway          | `text not null`                 |
| title            | `text not null`                 |
| description      | `text`                          |
| duration_minutes | `integer not null default 15`   |
| content          | `jsonb not null default '{}'`   |
| published        | `boolean not null default true` |
| position         | `integer not null default 1`    |

### learning_progress

Permission group: `read` · owner-private.

| Field        | PostgreSQL definition                                             |
| ------------ | ----------------------------------------------------------------- |
| module_id    | `uuid not null references learning_modules(id) on delete cascade` |
| user_id      | `uuid not null references user_profiles(id)`                      |
| status       | `text not null default 'Not started'`                             |
| answers      | `jsonb not null default '{}'`                                     |
| score        | `integer`                                                         |
| completed_at | `timestamptz`                                                     |
| unique       | `(module_id,user_id)`                                             |

### risk_assessments

Permission group: `manage`.

| Field       | PostgreSQL definition          |
| ----------- | ------------------------------ |
| title       | `text not null`                |
| category    | `text not null`                |
| severity    | `text not null`                |
| likelihood  | `text not null`                |
| mitigation  | `text`                         |
| owner       | `text`                         |
| status      | `text not null default 'Open'` |
| review_date | `date`                         |
| content     | `jsonb not null default '{}'`  |

### ai_incidents

Permission group: `operate`.

| Field       | PostgreSQL definition               |
| ----------- | ----------------------------------- |
| title       | `text not null`                     |
| category    | `text not null`                     |
| severity    | `text not null`                     |
| description | `text not null`                     |
| owner_id    | `uuid references user_profiles(id)` |
| status      | `text not null default 'Open'`      |
| remediation | `text`                              |
| closure     | `text`                              |

### audit_logs

Permission group: `read` · immutable.

| Field        | PostgreSQL definition               |
| ------------ | ----------------------------------- |
| actor_id     | `uuid references user_profiles(id)` |
| action       | `text not null`                     |
| entity_type  | `text not null`                     |
| entity_id    | `uuid`                              |
| before_state | `jsonb`                             |
| after_state  | `jsonb`                             |
| reason       | `text`                              |

### reports

Permission group: `manage`.

| Field        | PostgreSQL definition           |
| ------------ | ------------------------------- |
| title        | `text not null`                 |
| kind         | `text not null`                 |
| version      | `integer not null default 1`    |
| parent_id    | `uuid`                          |
| status       | `text not null default 'Draft'` |
| content      | `text not null`                 |
| evidence_ids | `jsonb not null default '[]'`   |
| assumptions  | `jsonb not null default '[]'`   |

### notifications

Permission group: `read` · owner-private.

| Field   | PostgreSQL definition                        |
| ------- | -------------------------------------------- |
| user_id | `uuid not null references user_profiles(id)` |
| title   | `text not null`                              |
| body    | `text`                                       |
| link    | `text`                                       |
| read_at | `timestamptz`                                |

### milestones

Permission group: `manage`.

| Field          | PostgreSQL definition               |
| -------------- | ----------------------------------- |
| title          | `text not null`                     |
| due_date       | `date not null`                     |
| completed_date | `date`                              |
| owner_id       | `uuid references user_profiles(id)` |
| status         | `text not null default 'Planned'`   |
| description    | `text`                              |

## Import CSV/XLSX schemas

Required fields are enforced by `server/validation.ts`; optional fields are retained where supported. Source row numbers are retained in rejection reports.

| Schema              | Required fields                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| inventory           | facility_id, product_id, unit, reporting_date, opening_stock, quantity_received, quantity_dispensed, adjustments, closing_stock, usable_stock, reserved_stock, expired_stock, stockout_days, expiry_date, minimum_stock, maximum_stock |
| budgets             | external_id, programme_code, programme_name, currency, period, amount                                                                                                                                                                  |
| funding_releases    | external_id, budget_id, currency, amount, due_date, status, period                                                                                                                                                                     |
| procurement_events  | external_id, programme_code, title, stage, currency, amount, due_date, expected_days                                                                                                                                                   |
| expenditure_records | external_id, programme_code, event_type, currency, amount, transaction_date, period                                                                                                                                                    |

Inventory additional fields: country, region, district, facility_type, medicine_name, supplier, expected_delivery_date, delivery_lead_time_days, batch_identifier, data_source, data_quality_status. Finance amounts are major units with ≤2 decimals; periods are YYYY-Q[1–4]. No implicit FX conversion.

## Synthetic files

| File                     | Rows | Meaning                                |
| ------------------------ | ---: | -------------------------------------- |
| facilities.csv           |   12 | Synthetic demonstration fixture        |
| medicine_products.csv    |    4 | Synthetic demonstration fixture        |
| inventory.csv            | 2496 | Synthetic demonstration fixture        |
| deliveries.csv           |   48 | Synthetic demonstration fixture        |
| consumption.csv          | 2496 | Synthetic demonstration fixture        |
| budgets.csv              |    4 | Synthetic demonstration fixture        |
| funding_releases.csv     |    8 | Synthetic demonstration fixture        |
| procurement_events.csv   |    4 | Synthetic demonstration fixture        |
| expenditure_records.csv  |   13 | Synthetic demonstration fixture        |
| intervention_options.csv |    8 | Synthetic demonstration fixture        |
| budget_scenarios.csv     |    3 | Synthetic demonstration fixture        |
| inventory_defects.csv    |    8 | Intentionally rejected quality fixture |

See DATA_QUALITY.md for validation semantics and MODEL_EVALUATION.md for analytical limitations.
