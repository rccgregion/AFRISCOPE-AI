# Product requirements

## Purpose and users

AfriScope AI helps development teams move from a scoped question to validated data, reproducible analysis, an evidence-backed recommendation, independent review, and recorded follow-up. It is decision support, not an autonomous allocator of medicine, money, or policy.

Primary users: programme managers, data analysts, operators, independent reviewers, organisation/platform administrators, and read-only executives. The MVP is a single-organisation-per-membership, multi-project web application with organisation and project isolation.

## Product principles

1. Deterministic code owns arithmetic, validation, finance, and constraints.
2. Statistical baselines own forecasts; exact search owns small allocation problems.
3. Language models explain permitted evidence; they do not create facts or execute actions.
4. Every consequential proposal retains evidence, assumptions, limitations, and human accountability.
5. Synthetic data is labelled and isolated from private workspaces.

## Implemented workflows

- Medicine availability: inspect source versions, validate inventory, compute usable stock and coverage, compare time-aware forecasts, identify constrained redistribution candidates, draft and review a proposal.
- Public finance: reconcile budgets, releases, procurement, and expenditure within explicit currencies; surface overdue stages and unmatched transactions without alleging fraud.
- Intervention prioritisation: define budget, geography, equity, duration, and dependency constraints; compute an exact feasible portfolio or explain infeasibility; compare scenarios and create a reviewable recommendation.

## Modules

Problem Scoping Studio, AI Experiment Lab, Data and Decision Intelligence, Programme Operations Hub, AI Learning Academy, Responsible AI and Governance. Supporting surfaces: Overview, Reports, Projects, Administration, Settings, public product overview, sign-in/invitation acceptance, and guide.

## Acceptance criteria

- A visitor can enter a clearly synthetic workspace without an API key.
- A manager cannot approve their own proposal; a reviewer records a reasoned decision; an operator separately records implementation and outcome.
- An executive cannot mutate data through the UI, API, or database role.
- A rejected import retains original rows and reasons; a fully rejected import does not replace analytical data.
- Zero/unreliable consumption does not produce a misleading coverage estimate; expired/reserved stock is excluded.
- Currencies are never silently summed or converted.
- Reports and assistant answers reference persisted project evidence.
- Demo reset requires explicit confirmation and affects only the demonstration organisation.

## Out of scope for this release

Live government/health/finance integrations, patient records, automated stock or fund transfers, accredited certification, email delivery, self-service password recovery, production identity federation, large-scale optimisation, causal impact estimation, and verified real-world productivity or health outcomes.
