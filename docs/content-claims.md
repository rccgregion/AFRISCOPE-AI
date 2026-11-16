# Content claims register

Every external, factual claim shown in the product or in the Experiment Lab
prompts must be listed here with an openable source, the date it was accessed and
one of three statuses:

- **VERIFIED** — a source URL below was opened and supports the claim as worded.
- **UNVERIFIED** — no source has been opened yet. The product must not present it
  as established fact.
- **REMOVED** — the claim was taken out of the product copy.

> Status of this register as of 2026-10-29: **nothing in this file is VERIFIED
> yet.** No source row below has been opened and confirmed, so every claim is
> UNVERIFIED and must be worded in the product as a claim to check.

## How this is enforced

- `server/prompts.ts` marks prompts 6 and 7 (Horizon 1000 alignment, South Africa
  expansion readiness) and the Horizon 1000 context prompt with
  `unverified_claims`. Any answer produced for those prompts appends:
  "The Horizon 1000 description in this prompt is UNVERIFIED in this build."
- `src/features/PromptLibrary.tsx` shows an "unverified claim" flag on those
  prompts before they are run.
- The deterministic prompt runner only reports numbers from imported rows; it
  never restates a claim as fact.

## Claims to check

| # | Claim as used | Where it appears | Source (to open) | Accessed | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Horizon 1000 is a commitment of a specific funding amount | Prompts 6, 7, C1; any project copy | _not yet opened_ | — | UNVERIFIED |
| 2 | Horizon 1000 partners and their roles | Prompts 6, 7, C1 | _not yet opened_ | — | UNVERIFIED |
| 3 | Horizon 1000 announcement date | Prompts 6, 7, C1 | _not yet opened_ | — | UNVERIFIED |
| 4 | Horizon 1000 target of 1,000 primary healthcare clinics | Prompts 6, 7, C1 | _not yet opened_ | — | UNVERIFIED |
| 5 | Horizon 1000 timeline (start country and expansion sequence Rwanda → Kenya, Nigeria, South Africa) | Prompts 6, 7, C1 | _not yet opened_ | — | UNVERIFIED |
| 6 | Details of any visit to Mwulire Health Center (who, when, purpose) | Prompt C1; project notes | _not yet opened_ | — | UNVERIFIED |
| 7 | BHCPF total release amounts and dates | Prompt 2 (Nigeria BHCPF linkage); Finance copy | _not yet opened_ | — | UNVERIFIED |
| 8 | BHCPF/BHCPF-disbursement totals reaching facility level and their dates | Prompts 2, 4, C2 | _not yet opened_ | — | UNVERIFIED |
| 9 | Gates Foundation office locations | Any partner copy | _not yet opened_ | — | UNVERIFIED |
| 10 | Gates Foundation office opening years | Any partner copy | _not yet opened_ | — | UNVERIFIED |
| 11 | CBHI statements about Ethiopia's community-based health insurance coverage | Prompt 5 (Ethiopia CBHI angle); prompt C3 | _not yet opened_ | — | UNVERIFIED |
| 12 | EPHI statements (Ethiopian Public Health Institute role and data access) | Prompt 5; dataset descriptions | _not yet opened_ | — | UNVERIFIED |
| 13 | "Mwulire Health Center" is a real facility, with no stock, risk or financing signals attached in this build | Sample-data project, facility `RW-MWU-001` | _not yet opened_ | — | UNVERIFIED |

## Claims deliberately avoided

- No funding, partnership, client, impact or accreditation claim is made anywhere
  in the product.
- No claim that a named real facility has a stockout or delayed funding is made
  unless the row is `data_origin='real'` and carries a recorded source.
- The Verified Content Pack (Task 2, Part D) was not supplied — the prompt that
  should have contained project name, problem brief, responsible-AI note and
  one-sentence overview still holds the literal placeholder text, so none of that
  copy has been added to the product.

## To verify a claim

1. Open the source URL and confirm it supports the claim **as worded**.
2. Record the URL and the access date in the table.
3. Change the status to VERIFIED, or reword/remove the claim.
4. If a claim is removed from the product, set the status to REMOVED and note
   where it was previously shown.
