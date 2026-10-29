# User guide

## Enter and navigate

Open `/welcome` and choose **Explore the live workspace**, or sign in at `/sign-in`. “Live” means the application is functional; all demo records are synthetic and historical (reference date 2026-09-30). Use the header project selector for Medicine availability, Public finance, or Intervention planning. The sidebar contains all modules; search finds accessible projects, datasets, reports, experiments, alerts, and learning modules.

## Roles

Demo entry exposes manager, analyst, operator, reviewer, executive, and organisation admin. Platform administration is provisioned separately. Settings shows the effective project role and lets you switch demo roles. UI gating is backed by API and database permissions.

## Data and analysis

Data Intelligence → Import dataset → choose schema/file → Preview & map → map required fields → Review import → Validate & import. Inspect Import history and Quality report; download rejected rows. Recalculate in Operations or run a forecast in Data Intelligence/Experiment Lab. Saved evidence retains source versions.

## Operations

Stock: filter by risk/country/search, inspect a row, export coverage, review redistribution candidates. Finance: select currency, inspect releases/procurement/reconciliation gaps. Alerts: acknowledge/investigate/resolve with notes. Approvals: open a row to inspect evidence and record a permitted decision. A proposal owner cannot approve or implement their own proposal.

## Planner and experiments

Create a scenario with budget, equity minimum, delivery window, and required geographies/options. Inspect selected packages, cost, assumed reach, constraints, and infeasibility reasons. Scenario creation also creates a draft recommendation. Experiment Lab runs supported forecast/threshold comparisons and stores results; unsupported external-model templates are not executed.

## Reports, learning, governance

Generate a report from selected evidence and download Markdown. Learning assessments are graded server-side; progress is private. Governance holds risk assessments, incidents, model information, and audit history. Administration manages invitations and project roles; invitation links must be delivered securely because email is not configured.

## Reset and privacy

Settings → demo reset requires typing `RESET` and an organisation-admin demo session. It resets only the synthetic organisation and signs demo users out. Do not upload patient, confidential, or unlawfully obtained data. Password recovery by email is not configured; contact an administrator. The assistant works locally without a key and labels that mode explicitly.
