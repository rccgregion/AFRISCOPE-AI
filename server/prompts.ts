/**
 * Saved Experiment Lab prompts.
 *
 * Verbatim copies of the approved prompt text — do not paraphrase or "improve"
 * these. Each prompt runs only against data present in the workspace; the
 * runner must report what is missing rather than invent facilities, stock or
 * signals.
 */
export type PromptScope = 'sample' | 'real' | 'both';

export type SavedPrompt = {
  id: string;
  group: string;
  title: string;
  prompt: string;
  /** Data the prompt needs; used to explain what is missing. */
  requires: Array<'stock' | 'financing' | 'countries' | 'none'>;
  /** Claims inside the prompt that are unverified (see docs/content-claims.md). */
  unverified_claims?: string[];
};

export const PROMPT_SCOPE_LABEL: Record<PromptScope, string> = {
  sample: 'Sample data only',
  real: 'Real data only',
  both: 'Sample and real',
};

const MAIN_GROUP = 'Stock, financing and decision support';
const CONTEXT_GROUP = 'Context prompts (no stock data needed)';

export const SAVED_PROMPTS: SavedPrompt[] = [
  {
    id: 'stockout-prioritisation',
    group: MAIN_GROUP,
    title: 'Stockout prioritisation',
    prompt:
      'Using the current facility stock coverage data for Rwanda, Kenya, Ethiopia, Nigeria and South Africa, identify the top 5 medicine-facility pairs with the highest stock-out risk in the next 30 days. For each, show usable stock, coverage days, and a short plain-language explanation suitable for a district health manager. Flag any that also have delayed financing signals.',
    requires: ['stock', 'financing', 'countries'],
  },
  {
    id: 'nigeria-bhcpf-linkage',
    group: MAIN_GROUP,
    title: 'Nigeria BHCPF linkage',
    prompt:
      'Using the current stock and financing signals for Nigerian facilities (Kano, Abuja, Lagos), identify where delayed BHCPF or NHIA-related signals are most likely contributing to low stock coverage. Explain the bottleneck in plain language suitable for a State Social Health Insurance Agency or district manager, and propose two human-reviewed actions.',
    requires: ['stock', 'financing'],
  },
  {
    id: 'cross-country-comparison',
    group: MAIN_GROUP,
    title: 'Cross-country comparison',
    prompt:
      'Compare stock-out risk patterns and financing bottlenecks between the Rwanda (Mwulire cluster), Kenya, Ethiopia, Nigeria and South Africa facilities in the current dataset. Highlight common root causes and country-specific differences that would affect how an AI decision-support tool should be adapted.',
    requires: ['stock', 'financing', 'countries'],
  },
  {
    id: 'intervention-ranking',
    group: MAIN_GROUP,
    title: 'Intervention ranking under budget / insurance constraints',
    prompt:
      'Given a fixed district budget ceiling and current BHCPF/NHIA release status for the Kano and Abuja facilities, rank these options: (1) emergency redistribution from a neighbouring facility, (2) accelerated local procurement, (3) temporary community health worker buffer stock. Explain trade-offs, including any implications for claims or capitation flows. Keep all recommendations non-binding.',
    requires: ['stock', 'financing'],
  },
  {
    id: 'ethiopia-cbhi',
    group: MAIN_GROUP,
    title: 'Ethiopia CBHI angle',
    prompt:
      'For the Ethiopian facilities in the dataset, show where low stock coverage coincides with pending CBHI claims or delayed public budget signals. Suggest plain-language next steps for a woreda or facility manager.',
    requires: ['stock', 'financing'],
  },
  {
    id: 'horizon-1000-alignment',
    group: MAIN_GROUP,
    title: 'Horizon 1000 alignment',
    prompt:
      'How could the current stock-visibility and financing diagnostics in AfriScope support the goals of Horizon 1000 (AI tools for 1,000 primary healthcare clinics starting in Rwanda and expanding to Kenya, Nigeria and South Africa)?',
    requires: ['stock'],
    unverified_claims: [
      'Horizon 1000 is described as AI tools for 1,000 primary healthcare clinics that expand to Kenya, Nigeria and South Africa — UNVERIFIED unless a source is recorded in docs/content-claims.md.',
    ],
  },
  {
    id: 'south-africa-readiness',
    group: MAIN_GROUP,
    title: 'South Africa expansion readiness',
    prompt:
      'What adaptations would the current AfriScope stock-and-financing diagnostics need to be useful in a South African primary clinic setting under Horizon 1000 expansion, given higher digital maturity?',
    requires: ['stock'],
    unverified_claims: [
      'Horizon 1000 expansion into South Africa — UNVERIFIED unless a source is recorded in docs/content-claims.md.',
    ],
  },
  {
    id: 'context-horizon-1000-rwanda',
    group: CONTEXT_GROUP,
    title: 'Horizon 1000 and Mwulire context',
    prompt:
      'Explain how a decision-support tool focused on medicine availability and financing signals could support the goals of Horizon 1000 in Rwanda, using Mwulire Health Center as a concrete example.',
    requires: ['none'],
    unverified_claims: [
      'Horizon 1000 goals as stated — UNVERIFIED pending a recorded source.',
    ],
  },
  {
    id: 'context-bhcpf-friction',
    group: CONTEXT_GROUP,
    title: "Nigeria BHCPF friction points",
    prompt:
      "Describe the known friction points in Nigeria's BHCPF flow (releases vs disbursements to facilities) and how an AI tool could surface delays for human review without automating payments.",
    requires: ['none'],
  },
  {
    id: 'context-bhcpf-vs-cbhi',
    group: CONTEXT_GROUP,
    title: 'BHCPF/NHIA compared with Ethiopia CBHI',
    prompt:
      "Compare the financing visibility challenges between Nigeria's BHCPF/NHIA system and Ethiopia's CBHI system at a high level. Keep recommendations non-binding.",
    requires: ['none'],
  },
  {
    id: 'context-south-africa-adaptation',
    group: CONTEXT_GROUP,
    title: 'Adaptations for a higher-digital-maturity setting',
    prompt:
      'What adaptations would a Rwanda-focused stock-and-financing diagnostic need if it were later tested in a higher-digital-maturity setting such as South Africa?',
    requires: ['none'],
  },
];

export const BEHAVIOUR_RULES = [
  'Runs only against data actually in this workspace. If required data is absent, the answer states exactly what is missing and does not invent facilities, stock or signals.',
  'Every answer states which data scope it used (Sample, Real, or Both).',
  'Answers built on sample rows carry a sample-data label at the top.',
  'Never states as fact that a named real facility has a stockout or delayed funding unless that comes from real-origin data with a recorded source.',
  'Recommendations are non-binding decision support only and require human review before any consequential action.',
];
