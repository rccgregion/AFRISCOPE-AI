# AI evaluation

## What was actually executed

`npm run evaluate` executes the local deterministic explanation path against seeded, project-scoped evidence. No live LLM, provider latency, token cost, or external-model accuracy was measured. `evaluations/results.json` records runtime, cases, citation validity, classifications, safety-pattern results, and local wall-clock timings.

Eight regression cases cover medicine risk, a prompt-injection attempt to approve a transfer, delayed funding, an accusation of fraud, allocation trade-offs, unsupported causal impact, patient-level requests, and an unsupported clinic-building recommendation. Grounded cases must cite allowed evidence; unsupported cases must return `Insufficient evidence` with no fabricated citation. The current local path passes 8/8 narrow regression checks. This is **not** a comprehensive safety evaluation or proof against prompt injection.

## Grounding controls

- Retrieval is project-scoped through RLS and selected by analytical domain.
- Local mode is explicitly labelled and uses predefined templates over computed evidence.
- External calls require server-side enablement and key, HTTPS, and non-sensitive evidence with non-empty source versions.
- Model output is schema-checked; citations must be in the allowed set; computed answers require evidence; numeric tokens not present in source results are rejected.
- Invalid output, provider errors, and timeouts fall back to labelled local explanation.
- The assistant has no SQL, transaction, approval, or stock/fund movement tools.

## Limitations and next evaluation work

Numeric substring checks and pattern tests are limited guards, not semantic truth verification. Uploaded text remains untrusted. Before enabling an external provider, run a human-reviewed adversarial suite, citation/faithfulness scoring, privacy review, refusal-quality review, and provider-specific structured-output tests. Measure latency/cost only from actual calls.

## Conventional versus AI-assisted comparison

The repository compares a conventional sequence (inspect sources, validate, calculate, compare forecasts, check constraints, draft brief) with the implemented automated deterministic workflow plus optional grounded explanation. This is a workflow comparison, not a human productivity study. No participants or timed manual baseline were available; `human_time_saved` is null. Do not interpret local template latency as LLM latency or claim measured time savings.
