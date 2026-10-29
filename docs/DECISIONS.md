# Architecture and product decisions

| Decision                                    | Rationale                                               | Consequence                                                                           |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Modular monolith                            | Coherent transactions and small deployment surface      | No independent service scaling; add queues only when measured need exists             |
| PGlite default, PostgreSQL adapter          | Functional persistent local demo without credentials    | PGlite is single-instance; external PostgreSQL adapter needs server integration tests |
| RLS plus API checks                         | Database isolation survives handler mistakes            | Membership helpers and reference triggers require migration discipline                |
| Immutable evidence/versions/approvals/audit | Traceability and reproducible review                    | Corrections create new versions/evidence, not silent edits                            |
| Deterministic analytics                     | Auditable arithmetic and constraints                    | LLM cannot improve or alter numerical results                                         |
| Simple forecast baselines                   | Honest time-aware comparison on small synthetic history | Not a production demand model; stockout censoring remains                             |
| Exact search ≤16 packages                   | Transparent optimal selection and infeasibility reasons | Larger portfolios need a tested optimisation solver                                   |
| Local assistant default                     | Usable without secrets or external calls                | Template prose, not generative reasoning; explicitly labelled                         |
| Optional explanation-only provider          | Narrow grounded language task                           | No live provider was tested; privacy review required before enablement                |
| No FX conversion                            | Avoid undocumented dated rates and false comparability  | Cross-currency totals are not provided                                                |
| Manual invitation delivery                  | No email credentials available                          | Single-use links must be delivered securely; email recovery is not implemented        |
| Synthetic historical snapshot               | Reproducible evaluation independent of wall-clock date  | UI labels historical reference date; not live operational data                        |
