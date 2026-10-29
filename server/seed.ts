/* eslint-disable @typescript-eslint/no-explicit-any -- Seed data crosses typed relational and JSON boundaries. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import Papa from 'papaparse';
import { ROLES, DEMO_ORG, DEMO_PROJECTS, AS_OF } from '../shared/domain';
import type { Database, Client } from './db';
import {
  json,
  stockAnalysis,
  forecastAnalysis,
  financeAnalysis,
  saveScenario,
  createRecommendation,
  reportMarkdown,
} from './services';
export const demoUserId = (role: string) =>
  `20000000-0000-4000-8000-${String(ROLES.indexOf(role as (typeof ROLES)[number]) + 1).padStart(12, '0')}`;
const rows = (name: string) =>
  Papa.parse<Record<string, string>>(readFileSync(resolve('public/demo', name + '.csv'), 'utf8'), {
    header: true,
    skipEmptyLines: true,
  }).data;
export async function insert(c: Client, table: string, data: Record<string, unknown>) {
  const keys = Object.keys(data);
  const result = await c.query(
    `insert into ${table}(${keys.join(',')}) values(${keys.map((_, i) => '$' + (i + 1)).join(',')}) returning *`,
    Object.values(data).map((v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v)),
  );
  return result.rows[0];
}
const base = (project: string) => ({
  organisation_id: DEMO_ORG,
  project_id: project,
  created_by: demoUserId('programme_manager'),
});
export async function seedDemo(db: Database, reset = false) {
  const [med, fin, plan] = DEMO_PROJECTS;
  const alreadySeeded = await db.admin(async (c) => {
    await c.query('select pg_advisory_xact_lock(729401)');
    const exists = (await c.query('select id from organisations where id=$1', [DEMO_ORG])).rows[0];
    if (exists && !reset) return true;
    if (exists) {
      for (const t of [
        'inventory_records',
        'consumption_records',
        'funding_releases',
        'expenditure_records',
        'procurement_events',
        'budgets',
      ])
        await c.query(`delete from ${t} where organisation_id=$1`, [DEMO_ORG]);
      for (const t of [
        'data_import_jobs',
        'data_quality_results',
        'data_dictionary_entries',
        'dataset_versions',
        'datasets',
      ])
        await c.query(`delete from ${t} where organisation_id=$1`, [DEMO_ORG]);
      for (const t of [
        'reports',
        'learning_progress',
        'notifications',
        'recommendation_evidence',
        'approvals',
        'recommendations',
        'operational_alerts',
        'action_items',
        'evidence_records',
        'analytical_runs',
        'experiment_results',
        'experiment_runs',
        'experiments',
        'optimisation_scenarios',
        'intervention_options',
        'deliveries',
        'milestones',
        'risk_assessments',
        'ai_incidents',
        'problem_briefs',
        'requirements_documents',
        'stakeholders',
        'audit_logs',
      ])
        await c.query(`delete from ${t} where organisation_id=$1`, [DEMO_ORG]);
      for (const t of [
        'model_versions',
        'models',
        'learning_modules',
        'intervention_options',
        'facilities',
        'medicine_products',
      ])
        await c.query(`delete from ${t} where organisation_id=$1`, [DEMO_ORG]);
      await c.query('update projects set settings=$1 where organisation_id=$2', [
        json({ stock_threshold_days: 21, as_of: AS_OF }),
        DEMO_ORG,
      ]);
    } else {
      await insert(c, 'organisations', {
        id: DEMO_ORG,
        name: 'AfriScope AI Demonstration Environment',
        is_demo: true,
        settings: { retention_days: 365, external_ai: false },
      });
      for (const role of ROLES)
        await insert(c, 'user_profiles', {
          id: demoUserId(role),
          email: `demo.${role}@afriscope.example`,
          full_name: {
            platform_admin: 'Alex · Platform reviewer',
            organisation_admin: 'Amina · Organisation admin',
            programme_manager: 'Amina · Programme manager',
            data_analyst: 'Daniel · Data analyst',
            operator: 'Grace · Facility operator',
            reviewer: 'Joseph · Independent reviewer',
            executive: 'Sam · Executive observer',
          }[role],
          password_hash: null,
          is_platform_admin: false,
        });
      for (const role of ROLES)
        await insert(c, 'organisation_memberships', {
          organisation_id: DEMO_ORG,
          user_id: demoUserId(role),
          role,
        });
      const projects = [
        {
          title: 'Medicine Availability Intelligence',
          sector: 'Public health',
          countries: 'Kijani Republic · Umoja Federation',
          description:
            'Anticipate essential medicine stockouts and review evidence-backed redistribution opportunities.',
        },
        {
          title: 'Public Finance Flow Intelligence',
          sector: 'Public finance',
          countries: 'Kijani Republic · Umoja Federation',
          description:
            'Connect budgets, releases, procurement and expenditure without conflating financial events.',
        },
        {
          title: 'Health Intervention Prioritisation',
          sector: 'Public health',
          countries: 'Kijani Republic',
          description:
            'Compare feasible intervention packages under explicit budget, equity and delivery constraints.',
        },
      ];
      for (let i = 0; i < 3; i++)
        await insert(c, 'projects', {
          id: DEMO_PROJECTS[i],
          organisation_id: DEMO_ORG,
          ...projects[i],
          settings: { stock_threshold_days: 21, as_of: AS_OF },
          created_by: demoUserId('programme_manager'),
        });
      for (const p of DEMO_PROJECTS)
        for (const role of ROLES)
          await insert(c, 'project_memberships', {
            project_id: p,
            user_id: demoUserId(role),
            role,
          });
    }
    await seedLearning(c);
    await seedModels(c);
    const facilityIds = new Map<string, string>(),
      productIds = new Map<string, string>();
    {
      for (const f of rows('facilities')) {
        const r = await insert(c, 'facilities', { ...base(med), ...f });
        facilityIds.set(f.external_id, String(r.id));
      }
      for (const p of rows('medicine_products')) {
        const r = await insert(c, 'medicine_products', { ...base(med), ...p });
        productIds.set(p.external_id, String(r.id));
      }
      const optionIds = new Map<string, string>();
      for (const o of rows('intervention_options')) {
        const r = await insert(c, 'intervention_options', {
          ...base(plan),
          name: o.name,
          target_population: o.target_population,
          geography: o.geography,
          cost_cents: Number(o.cost) * 100,
          currency: o.currency,
          unit_cost_cents: Math.round(Number(o.unit_cost) * 100),
          expected_outcome: Number(o.expected_outcome),
          outcome_unit: o.outcome_unit,
          evidence_source: o.evidence_source,
          evidence_quality: o.evidence_quality,
          capacity: Number(o.capacity),
          implementation_months: Number(o.implementation_months),
          constraints: o.constraints,
          equity_group: o.equity_group,
          dependencies: [],
        });
        optionIds.set(o.id, String(r.id));
      }
      for (const o of rows('intervention_options'))
        await c.query('update intervention_options set dependencies=$1 where id=$2', [
          json(JSON.parse(o.dependencies).map((id: string) => optionIds.get(id))),
          optionIds.get(o.id),
        ]);
    }
    const versions = new Map<string, string>();
    const kinds = [
      'inventory',
      'consumption',
      'deliveries',
      'budgets',
      'funding_releases',
      'procurement_events',
      'expenditure_records',
      'intervention_options',
    ];
    for (const kind of kinds) {
      const project = [
        'budgets',
        'funding_releases',
        'procurement_events',
        'expenditure_records',
      ].includes(kind)
        ? fin
        : kind === 'intervention_options'
          ? plan
          : med;
      const data = rows(kind);
      const d = await insert(c, 'datasets', {
        ...base(project),
        name:
          kind.replaceAll('_', ' ').replace(/^./, (s) => s.toUpperCase()) +
          ' · synthetic demonstration',
        description:
          'Fixed seed 20260930. Fictional countries and facilities. No real government, patient or financial records.',
        source: 'scripts/generate_demo_data.py',
        owner: 'AfriScope demonstration data steward',
        sensitivity: 'Synthetic public',
        quality_status: 'Validated',
        reporting_period:
          kind === 'inventory' ? '2025-10-08 — 2026-09-30' : '2026-Q3 / planning assumptions',
        geographic_coverage: 'Kijani Republic and Umoja Federation (fictional)',
        lineage: 'Deterministic generator → clean CSV → validated relational seed',
        kind,
      });
      const v = await insert(c, 'dataset_versions', {
        ...base(project),
        dataset_id: d.id,
        version: 1,
        row_count: data.length,
        checksum: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
        period_start: kind === 'inventory' ? '2025-10-08' : '2026-07-01',
        period_end: AS_OF,
        notes: 'Clean demonstration snapshot; defects quarantined in separate fixture.',
      });
      versions.set(kind, String(v.id));
      await insert(c, 'data_quality_results', {
        ...base(project),
        dataset_id: d.id,
        version_id: v.id,
        metrics: {
          records: data.length,
          accepted: data.length,
          rejected: 0,
          validity_percent: 100,
          accuracy: 'Not externally verified',
        },
        issues: [],
        limitations: [
          'Structural validation only; not proof of operational accuracy.',
          'Defect fixture excluded.',
        ],
      });
      await insert(c, 'data_import_jobs', {
        ...base(project),
        dataset_id: d.id,
        version_id: v.id,
        filename: kind + '.csv',
        kind,
        status: 'Completed',
        accepted_count: data.length,
        rejected_count: 0,
        columns: Object.keys(data[0]),
        mapping: Object.fromEntries(Object.keys(data[0]).map((k) => [k, k])),
        preview_rows: data.slice(0, 5),
      });
      const { requiredFields, inventoryFields, financeFields } = await import('./validation');
      const fields =
        kind === 'inventory' ? [...inventoryFields] : financeFields[kind] || Object.keys(data[0]);
      for (const field of fields)
        await insert(c, 'data_dictionary_entries', {
          ...base(project),
          dataset_id: d.id,
          field_name: field,
          definition: field.replaceAll('_', ' '),
          data_type:
            field.includes('stock') || ['quantity', 'amount', 'capacity'].includes(field)
              ? 'number'
              : 'string',
          unit:
            field === 'unit'
              ? 'Product-specific'
              : field.includes('amount')
                ? 'Declared currency, major units'
                : field.includes('stock') || field === 'quantity'
                  ? 'Product units'
                  : 'Not applicable',
          required: (requiredFields[kind] || []).includes(field),
          allowed_values:
            field === 'currency' ? 'NGN, KES; never implicitly converted' : 'See validation rules',
          validation_rule: 'See server/validation.ts and docs/DATA_DICTIONARY.md',
          example: String(data[0][field] ?? ''),
          source: 'Fixed-seed synthetic generator',
          sensitivity: 'Synthetic public',
          relationships: field.endsWith('_id')
            ? 'Business key resolved within this project'
            : 'Part of the dataset business key',
        });
    }
    const budgetIds = new Map<string, string>();
    for (const kind of kinds) {
      const project = [
        'budgets',
        'funding_releases',
        'procurement_events',
        'expenditure_records',
      ].includes(kind)
        ? fin
        : kind === 'intervention_options'
          ? plan
          : med;
      const version = versions.get(kind);
      for (const [index, r] of rows(kind).entries()) {
        const common = { ...base(project), version_id: version, source_row: index + 2 };
        if (kind === 'inventory') {
          const d = new Date(r.reporting_date + 'T12:00:00Z');
          d.setUTCDate(d.getUTCDate() - 6);
          await insert(c, 'inventory_records', {
            ...common,
            facility_id: facilityIds.get(r.facility_id),
            product_id: productIds.get(r.product_id),
            reporting_date: r.reporting_date,
            ...Object.fromEntries(
              [
                'opening_stock',
                'quantity_received',
                'quantity_dispensed',
                'adjustments',
                'closing_stock',
                'usable_stock',
                'reserved_stock',
                'expired_stock',
                'stockout_days',
                'minimum_stock',
                'maximum_stock',
              ].map((k) => [k, Number(r[k])]),
            ),
            expiry_date: r.expiry_date,
            batch_identifier: r.batch_identifier,
            country: r.country,
            supplier: r.supplier,
            quality_status: 'Validated synthetic',
          });
        }
        if (kind === 'consumption')
          await insert(c, 'consumption_records', {
            ...common,
            facility_id: facilityIds.get(r.facility_id),
            product_id: productIds.get(r.product_id),
            period_start: r.period_start,
            period_end: r.period_end,
            quantity: Number(r.quantity),
            unit: r.unit,
          });
        if (kind === 'deliveries')
          await insert(c, 'deliveries', {
            ...base(project),
            external_id: r.external_id,
            facility_id: facilityIds.get(r.facility_id),
            product_id: productIds.get(r.product_id),
            expected_date: r.expected_date,
            quantity: Number(r.quantity),
            unit: r.unit,
            lead_time_days: Number(r.lead_time_days),
            status: r.status,
          });
        if (kind === 'budgets') {
          const b = await insert(c, 'budgets', {
            ...common,
            external_id: r.external_id,
            programme_code: r.programme_code,
            programme_name: r.programme_name,
            funding_source: r.funding_source,
            currency: r.currency,
            period: r.period,
            amount_cents: Number(r.amount) * 100,
            geography: r.geography,
          });
          budgetIds.set(r.external_id, String(b.id));
        }
        if (kind === 'funding_releases')
          await insert(c, 'funding_releases', {
            ...common,
            external_id: r.external_id,
            budget_id: budgetIds.get(r.budget_id),
            currency: r.currency,
            amount_cents: Number(r.amount) * 100,
            due_date: r.due_date,
            released_date: r.released_date || null,
            status: r.status,
            period: r.period,
          });
        if (kind === 'procurement_events')
          await insert(c, 'procurement_events', {
            ...common,
            external_id: r.external_id,
            programme_code: r.programme_code,
            title: r.title,
            stage: r.stage,
            currency: r.currency,
            amount_cents: Number(r.amount) * 100,
            started_date: r.started_date,
            due_date: r.due_date,
            completed_date: r.completed_date || null,
            expected_days: Number(r.expected_days),
            supplier: r.supplier,
            approval_reference: r.approval_reference,
          });
        if (kind === 'expenditure_records')
          await insert(c, 'expenditure_records', {
            ...common,
            external_id: r.external_id,
            programme_code: r.programme_code,
            budget_id: budgetIds.get(r.budget_id) || null,
            event_type: r.event_type,
            currency: r.currency,
            amount_cents: Number(r.amount) * 100,
            transaction_date: r.transaction_date,
            period: r.period,
            reference: r.reference,
            description: r.description,
          });
      }
    }
    return false;
  });
  if (alreadySeeded) return;
  await db.scoped(demoUserId('programme_manager'), async (tx) => {
    const stock = await stockAnalysis(tx, med),
      forecast = await forecastAnalysis(tx, med),
      finance = await financeAnalysis(tx, fin);
    const transfer = stock.rows.find((r) => r.transfer_opportunity)?.transfer_opportunity;
    if (transfer && stock.evidence_id) {
      await createRecommendation(
        tx,
        med,
        'Review redistribution of amoxicillin',
        'A facility faces a supply gap before its next expected delivery.',
        { kind: 'redistribution', ...transfer },
        'Proposed coverage improvement only; not a measured health outcome.',
        String(stock.evidence_id),
        ['Verify counts, batch quality, transport permissions and recipient demand.'],
        'Under Review',
      );
    }
    if ((finance as Record<string, unknown>)?.evidence_id)
      await createRecommendation(
        tx,
        fin,
        'Investigate overdue releases and unmatched payment',
        'Funding and procurement delays may interrupt programme delivery.',
        {
          kind: 'investigation',
          overdue_releases: finance.overdue_releases.length,
          unmatched_transactions: finance.unmatched.length,
          action: 'Assign finance-owner verification; do not infer misconduct.',
        },
        'Improved completeness of the funding trail.',
        String((finance as Record<string, unknown>).evidence_id),
        ['A delay is not evidence of fraud.'],
        'Under Review',
      );
    for (const s of rows('budget_scenarios')) {
      const created = await insert(tx, 'optimisation_scenarios', {
        ...base(plan),
        name: s.name,
        budget_cents: Number(s.budget) * 100,
        currency: 'USD',
        constraints: {
          required_geographies: JSON.parse(s.required_geographies),
          equity_minimum: Number(s.equity_minimum),
          max_months: Number(s.max_months),
        },
      });
      const solved: Record<string, any> = await saveScenario(tx, plan, String(created.id));
      const rec = await createRecommendation(
        tx,
        plan,
        `Review portfolio: ${s.name}`,
        'Select feasible packages within explicit constraints.',
        { kind: 'allocation', scenario_id: created.id, selected: solved.result.selected },
        'Synthetic assumed reach, not a causal health benefit.',
        String(solved.evidence_id),
        solved.result.assumptions,
      );
      await tx.query('update optimisation_scenarios set recommendation_id=$1 where id=$2', [
        rec.id,
        created.id,
      ]);
    }
    await seedNarrative(tx, med, fin, plan, forecast, stock);
  });
}
export async function bootstrapAdmin(
  db: Database,
  identity: { email?: string; username?: string },
  password: string,
) {
  if (password.length < 12) throw new Error('Use a password of at least 12 characters');
  const email = identity.email?.trim().toLowerCase();
  const username = identity.username?.trim().toLowerCase();
  if (!email && !username) throw new Error('Provide an email or username');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
  if (username && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))
    throw new Error('Invalid username');
  await db.admin(async (c) => {
    if (
      email &&
      (await c.query('select id from user_profiles where lower(email)= $1', [email])).rows.length
    )
      throw new Error('Account already exists');
    if (
      username &&
      (await c.query('select id from user_profiles where lower(username)= $1', [username])).rows
        .length
    )
      throw new Error('Username already exists');
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    const u = await insert(c, 'user_profiles', {
      email: email || null,
      username: username || null,
      full_name: username || 'Organisation administrator',
      password_hash: `scrypt:${salt}:${hash}`,
      is_platform_admin: false,
    });
    const o = await insert(c, 'organisations', {
      name: (email ? email.split('@')[1] : username) + ' workspace',
    });
    await insert(c, 'organisation_memberships', {
      organisation_id: o.id,
      user_id: u.id,
      role: 'organisation_admin',
    });
  });
}
async function seedModels(c: Client) {
  for (const p of DEMO_PROJECTS) {
    await insert(c, 'models', {
      ...base(p),
      name:
        p === DEMO_PROJECTS[0]
          ? 'Baseline consumption forecasting'
          : p === DEMO_PROJECTS[1]
            ? 'Evidence-grounded demonstration assistant'
            : 'Exact intervention allocation',
      purpose: 'Decision support with human review',
      intended_users: 'Programme managers, analysts and authorised reviewers',
      intended_use: 'Explain or evaluate synthetic, validated project evidence',
      prohibited_use:
        'Autonomous funding, procurement, medicine transfers, clinical decisions, or fraud accusations',
      inputs: 'Approved, access-controlled project evidence; no patient-level data',
      owner: 'Demonstration responsible AI lead',
      risk_classification: 'Consequential decision support — human review required',
      review_date: '2026-12-31',
      limitations: 'No external LLM evaluation. No clinical validity. No causal effect estimates.',
    });
  }
}
async function seedLearning(c: Client) {
  const pathways = [
    'AI fundamentals for development professionals',
    'Effective LLM use for research and programme operations',
    'Data quality and evidence-based decision-making',
    'Forecasting and predictive analytics',
    'Responsible AI, privacy, fairness, and human oversight',
    'Evaluating AI prototypes',
    'Using AI-assisted decision-support systems',
    'Communicating analytical findings to non-technical stakeholders',
  ];
  for (let i = 0; i < pathways.length; i++) {
    const first = i === 2;
    await insert(c, 'learning_modules', {
      ...base(DEMO_PROJECTS[0]),
      pathway: pathways[i],
      title: first ? 'From data quality to trustworthy decisions' : pathways[i],
      description: first
        ? 'A complete worked lesson: inspect evidence, challenge assumptions, and communicate uncertainty.'
        : `Practical foundations for ${pathways[i].toLowerCase()}. Apply the principles to your project.`,
      duration_minutes: first ? 20 : 15,
      position: i + 1,
      content: {
        objectives: first
          ? [
              'Distinguish completeness from accuracy.',
              'Trace a recommendation to its source version.',
              'Communicate a limitation without overstating confidence.',
            ]
          : [
              `Identify where ${pathways[i].toLowerCase()} applies.`,
              'Recognise when simpler methods are sufficient.',
              'Document a human review checkpoint.',
            ],
        sections: [
          {
            title: 'The core idea',
            body: first
              ? 'A complete dataset can still be wrong. Completeness measures whether required values are present. Accuracy requires comparison with a trustworthy external reference. AfriScope validates structure and consistency, but cannot confirm what happened inside a facility from a CSV alone.'
              : 'Start with the decision, not the technology. Define the question, inspect the available evidence, and choose the simplest method that can answer it. Keep numerical calculations in validated application code.',
          },
          {
            title: 'Worked example',
            body: first
              ? 'In the medicine demonstration, a stock record may balance arithmetically while the physical count is outdated. Check the reporting date, product unit, usable stock, and consumption history before acting on days-of-stock coverage. A zero-consumption history does not prove infinite coverage.'
              : 'Use the project workspace to identify a decision, its dataset version, its method, and its reviewer. An AI-generated explanation is a hypothesis until its evidence has been checked.',
          },
          {
            title: 'Practical exercise',
            body: first
              ? 'Open Data Intelligence and download inventory_defects.csv. Upload it into the validation workspace, map its columns, and inspect the rejection report. Explain why a duplicate, incompatible unit, and missing consumption value need different remedies. Do not include rejected rows in an operational total.'
              : 'Write a one-paragraph decision brief with a question, source, method, assumption, limitation, and approval checkpoint. Ask a colleague to identify any unsupported claim.',
          },
        ],
        quiz: [
          {
            question: first
              ? 'A required field is present in every row. What has been demonstrated?'
              : 'Which task should remain deterministic?',
            options: first
              ? [
                  'Structural completeness, not real-world accuracy',
                  'The values are accurate',
                  'The intervention is effective',
                  'The model is unbiased',
                ]
              : [
                  'Financial totals and constraint checks',
                  'Drafting a plain-language summary',
                  'Suggesting investigation questions',
                ],
            answer: 0,
            explanation: first
              ? 'Completeness is measurable from the records. Accuracy needs a trustworthy external reference.'
              : 'Use validated code for arithmetic and constraints; language models can explain verified results.',
          },
          {
            question: 'What should accompany a recommendation?',
            options: [
              'Only a confidence percentage',
              'Evidence references, assumptions, limitations, and human review',
              'A guarantee of impact',
            ],
            answer: 1,
            explanation:
              'Traceability and explicit review are required for consequential decisions.',
          },
        ],
        rubric: [
          { criterion: 'Evidence traceability', marks: 40 },
          { criterion: 'Correct interpretation of quality or method', marks: 30 },
          { criterion: 'Limitations and safe next action', marks: 30 },
        ],
        facilitator:
          'Allow 10 minutes for the exercise and 5 minutes for peer review. Ask learners to distinguish a measured result from an assumption. This is a completion record, not an accredited credential.',
      },
    });
  }
}
async function seedNarrative(
  c: Client,
  med: string,
  fin: string,
  plan: string,
  forecast: Awaited<ReturnType<typeof forecastAnalysis>>,
  stock: Awaited<ReturnType<typeof stockAnalysis>>,
) {
  const brief = await insert(c, 'problem_briefs', {
    ...base(med),
    title: 'Essential medicine continuity · problem brief',
    status: 'Approved',
    content: {
      problem:
        'Facility teams lack a timely, shared view of stockout risk and feasible redistribution.',
      countries: 'Kijani Republic; Umoja Federation (fictional)',
      region: 'Northern and Central Zones',
      population: 'Synthetic facility catchments',
      current_workflow: 'Weekly facility reports reviewed manually.',
      existing_intervention: 'Periodic stock review and scheduled deliveries.',
      pain_points: 'Late reports, incompatible units, delayed replenishment.',
      urgency: 'High',
      users: 'Facility operators, programme managers, independent reviewers',
      sponsor: 'Demonstration programme sponsor',
      owner: 'Amina · Programme manager',
      root_causes: [
        'Reporting delays',
        'Replenishment lead-time variability',
        'Limited cross-facility visibility',
      ],
      competing_explanations: [
        'Recorded consumption may be stockout-censored',
        'Apparent excess may be reserved for expected demand',
      ],
      stakeholders: ['Facility pharmacist', 'District supply officer', 'Programme finance owner'],
      workflow: ['Report', 'Validate', 'Assess', 'Review', 'Record outcome'],
      constraints: ['No autonomous stock transfers', 'Same product and unit only'],
      datasets: ['Weekly inventory', 'Consumption history', 'Expected deliveries'],
      lawful_use: 'Synthetic public demonstration. Real deployment requires data-sharing review.',
      assessment:
        'Use conventional inventory arithmetic and baseline statistical forecasts. LLM explanations are optional; no AI is needed for calculations.',
      baseline: 'Manual review; no measured time baseline collected.',
      outcome: 'Earlier identification of facilities needing supply verification.',
      kpis: ['Held-out WAPE', 'Stockout-risk review completion', 'Rejected-record resolution'],
      evaluation: 'Chronological 70/15/15 split; operational usability study still required.',
      risks: ['Outdated snapshots', 'Incorrect units', 'Overlapping package reach'],
      milestones: ['Validate inventory', 'Evaluate baseline', 'Review proposal'],
      resources: ['Data steward', 'Programme reviewer', 'Part-time analyst'],
      acceptance: [
        'All totals traceable',
        'No automatic transfer',
        'Reviewer can reject with reason',
      ],
      missing_information: [
        'Real transport costs',
        'Verified physical counts',
        'Consent and legal basis for real data',
      ],
      assumptions: ['All countries, facilities, counts and costs are synthetic.'],
    },
  });
  await insert(c, 'requirements_documents', {
    ...base(med),
    title: 'Medicine intelligence · requirements and delivery plan',
    content: {
      brief_id: brief.id,
      requirements: [
        'CSV/XLSX import with column mapping',
        'Explicit rejection report',
        'Time-aware forecast evaluation',
        'Evidence-backed human approval',
      ],
      dependencies: ['Verified facility and product master data'],
      acceptance: ['Inventory balance checks pass', 'Cross-tenant access denied'],
    },
  });
  for (const [name, role, notes] of [
    [
      'District supply officer',
      'Owns stock verification',
      'Confirm physical counts and transfer permissions',
    ],
    ['Facility pharmacist', 'Source data owner', 'Check units and expiry'],
    ['Independent reviewer', 'Approval authority', 'Review evidence before any operational action'],
  ])
    await insert(c, 'stakeholders', {
      ...base(med),
      name,
      role,
      influence: 'High',
      interest: 'High',
      notes,
    });
  for (const p of DEMO_PROJECTS) {
    await insert(c, 'risk_assessments', {
      ...base(p),
      title: 'Operational decision-support risk assessment',
      category: 'Human oversight',
      severity: 'High',
      likelihood: 'Possible',
      mitigation:
        'Independent review, immutable evidence versions, access control, synthetic-only external model policy.',
      owner: 'Responsible AI lead',
      review_date: '2026-12-31',
      content: {
        privacy: 'No personal or patient data in demo.',
        fairness: 'Report subgroup sample sizes; no bias-free claim.',
        unsupported_use: 'No autonomous allocation or misconduct inference.',
        consent: 'Real data requires a documented lawful basis.',
        retention:
          'Demo resets remove operational records; audit retention policy must be configured for real deployment.',
      },
    });
    await insert(c, 'milestones', {
      ...base(p),
      title:
        p === med
          ? 'Verify proposed redistribution'
          : p === fin
            ? 'Resolve funding reference gap'
            : 'Validate intervention assumptions',
      due_date: '2026-10-15',
      owner_id: demoUserId('programme_manager'),
      description: 'Demonstration milestone tied to the fixed September snapshot.',
    });
    await insert(c, 'action_items', {
      ...base(p),
      title:
        p === med
          ? 'Confirm donor physical count'
          : p === fin
            ? 'Request missing purchase-order reference'
            : 'Review reach overlap and unit costs',
      description: 'Synthetic demonstration assignment.',
      owner_id: demoUserId('operator'),
      due_date: '2026-10-12',
      priority: 'High',
    });
  }
  const experiment = await insert(c, 'experiments', {
    ...base(med),
    name: 'Moving average vs exponential smoothing',
    objective: 'Compare baseline weekly consumption forecasts on the same held-out records.',
    hypothesis:
      'Either baseline may perform better; choose using validation MAE, not test results.',
    method: 'forecast-comparison',
    model_version: 'forecast-1.0',
    configuration: { window: 4, alpha: 0.3, horizon: 4 },
    evaluation_criteria: 'MAE, WAPE and bias on a chronological held-out test period.',
    expected_outcome: 'A reproducible baseline comparison, not a presumed winner.',
    limitations: 'Stockout-censored observations; no external clinical validation.',
    status: 'Completed',
    owner: 'Daniel · Data analyst',
  });
  const run = await insert(c, 'experiment_runs', {
    ...base(med),
    experiment_id: experiment.id,
    status: 'Completed',
    configuration: { window: 4, alpha: 0.3, horizon: 4 },
    result: forecast ? { validation: forecast.validation, test: forecast.test } : {},
    duration_ms: null,
    cost: null,
    failure_cases: ['No uncensored demand during stockouts.'],
  });
  for (const m of forecast?.test || [])
    await insert(c, 'experiment_results', {
      ...base(med),
      run_id: run.id,
      test_case: m.method,
      input: { period: forecast?.test_period },
      output: m,
      metrics: m,
      passed: true,
    });
  await c.query(
    "update experiments set actual_outcome='Executed on the fixed synthetic dataset. See linked run for measured metrics.',conclusions='Validation chooses the method; held-out metrics are recorded without claiming operational superiority.',next_steps='Collect uncensored demand and prospectively validate before deployment.',decision='Continue baseline evaluation' where id=$1",
    [experiment.id],
  );
  await insert(c, 'experiments', {
    ...base(med),
    name: 'Evidence-grounded summary: structured vs narrative prompt',
    objective: 'Compare explanation grounding on fixed evidence.',
    hypothesis: 'Structured source references reduce unsupported claims.',
    method: 'llm-prompt-comparison',
    configuration: { external_llm: false },
    evaluation_criteria: 'Citation correctness, numerical consistency, unsupported claims.',
    expected_outcome: 'Unverified — requires a configured model and evaluation run.',
    status: 'Draft',
    limitations: 'Illustrative only; no external LLM execution or measured cost.',
    owner: 'Responsible AI lead',
  });
  const evidence = (
    await c.query(
      'select * from evidence_records where project_id=any($1::uuid[]) order by created_at',
      [DEMO_PROJECTS],
    )
  ).rows;
  for (const p of DEMO_PROJECTS) {
    const es = evidence.filter((e) => e.project_id === p);
    const title =
      p === med
        ? 'Medicine availability · evidence and decision brief'
        : p === fin
          ? 'Public finance · reconciliation brief'
          : 'Intervention planning · scenario comparison';
    const report = await insert(c, 'reports', {
      ...base(p),
      title,
      kind:
        p === med
          ? 'Operational evidence'
          : p === fin
            ? 'Executive finance'
            : 'Scenario evaluation',
      content: reportMarkdown(title, 'Demonstration', es, p),
      evidence_ids: es.map((e) => e.id),
      assumptions: ['Synthetic data; not real-world outcomes.'],
    });
    void report;
  }
  await insert(c, 'learning_progress', {
    ...base(med),
    module_id: (
      await c.query("select id from learning_modules where pathway like 'Data quality%' limit 1")
    ).rows[0].id,
    user_id: demoUserId('programme_manager'),
    status: 'Completed',
    score: 100,
    answers: { demonstration: true },
    completed_at: new Date().toISOString(),
  });
  await insert(c, 'audit_logs', {
    ...base(med),
    actor_id: demoUserId('programme_manager'),
    action: 'problem_brief.review_recorded',
    entity_type: 'problem_briefs',
    entity_id: brief.id,
    after_state: json({ status: 'Approved', version: 1 }),
    reason: 'Synthetic pre-reviewed example brief; not an executed approval in this session.',
  });
  void stock;
}
