import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createDatabase, type Database } from '../../server/db';
import { createApp } from '../../server/app';
import { seedDemo } from '../../server/seed';
import {
  importSamplePack,
  SAMPLE_LABEL,
  SAMPLE_NAME_PREFIX,
  SIMULATED_ALERT_PREFIX,
} from '../../server/sample-pack';
import { dryRunClear, clearSampleData, CLEAR_CONFIRMATION } from '../../server/sample-controls';
import {
  validateFacilitiesCsv,
  validateStockCsv,
  facilityTemplateCsv,
  stockTemplateCsv,
} from '../../server/real-import';
import { SAVED_PROMPTS, BEHAVIOUR_RULES } from '../../server/prompts';

let db: Database, app: Express;
const agents: Record<string, ReturnType<typeof request.agent>> = {};
const path = (p: string) => '/api' + p;
const post = (role: string, p: string, body: unknown) =>
  agents[role]
    .post(path(p))
    .set('X-AfriScope-Request', '1')
    .send(body as object);
const get = (role: string, p: string) => agents[role].get(path(p)).set('X-AfriScope-Request', '1');

let projectId = '';
let sampleProjectId = '';
let orgId = '';
/** Read-only query helper (the Database interface exposes admin/scoped). */
const q = (sql: string, params: unknown[] = []) => db.admin((c) => c.query(sql, params));

const FACILITIES_CSV = [
  'facility_id,facility_name,country,state_or_region,district_or_lga,facility_type,catchment_population,lat,lon,source',
  'NG-TEST-001,Test Health Post,Nigeria,Kano,Nassarawa,Primary Health Centre,12000,12.00,8.52,State HMIS export 2026-10-01',
  'NG-TEST-002,Second Test Post,Nigeria,Kano,Nassarawa,Primary Health Centre,8000,,,State HMIS export 2026-10-01',
].join('\n');

const STOCK_CSV = [
  'facility_id,medicine,usable_stock_units,avg_daily_consumption,as_of_date,financing_signal,reporting_period,source',
  'NG-TEST-001,Amoxicillin 250mg,120,4,2026-10-01,BHCPF release pending,2026-09,State HMIS export 2026-10-01',
].join('\n');

beforeAll(async () => {
  // Restore is opt-in in production; the tests enable it explicitly.
  process.env.SAMPLE_DATA_RESTORE = 'true';
  db = await createDatabase({ path: ':memory:' });
  await seedDemo(db);
  app = createApp(db);
  for (const role of ['data_analyst', 'organisation_admin', 'executive']) {
    agents[role] = request.agent(app);
    await post(role, '/auth/demo', { role }).expect(200);
  }
  const ws = await get('organisation_admin', '/workspace').expect(200);
  projectId = ws.body.projects[0].id;
  orgId = ws.body.organisations[0].id;
  const pack = await importSamplePack(db, ws.body.user.id);
  sampleProjectId = String(pack.projectId);
}, 90000);

afterAll(async () => {
  delete process.env.SAMPLE_DATA_RESTORE;
  await db?.close();
});

describe('sample data marking', () => {
  it('marks sample rows and keeps the one real facility real', async () => {
    const sample = await q(
      `select external_id, name, data_origin, latitude, longitude from facilities
        where data_origin='sample' order by external_id`,
    );
    expect(sample.rows.length).toBeGreaterThanOrEqual(10);
    for (const f of sample.rows) {
      expect(String(f.name).startsWith(SAMPLE_NAME_PREFIX)).toBe(true);
      expect(f.latitude).toBeNull();
      expect(f.longitude).toBeNull();
    }
    const real = await q(
      `select f.external_id, f.data_origin,
              (select count(*)::int from inventory_records i where i.facility_id=f.id) as stock
         from facilities f where f.external_id='RW-MWU-001'`,
    );
    expect(real.rows[0].data_origin).toBe('real');
    expect(real.rows[0].stock).toBe(0);
  });

  it('computes coverage_days from stock and consumption instead of trusting input', async () => {
    const rows = await q(
      `select usable_stock, avg_daily_consumption, coverage_days, supplied_coverage_days,
              coverage_mismatch
         from inventory_records
        where data_origin='sample' and avg_daily_consumption > 0`,
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    for (const r of rows.rows) {
      const expected = Number(r.usable_stock) / Number(r.avg_daily_consumption);
      expect(Math.abs(Number(r.coverage_days) - expected)).toBeLessThan(1);
    }
  });

  it('prefixes every sample alert with "Simulated:" and names a [Sample] site', async () => {
    const alerts = await q(
      `select title, data_origin from operational_alerts where data_origin='sample'`,
    );
    expect(alerts.rows.length).toBeGreaterThan(0);
    for (const a of alerts.rows) {
      expect(String(a.title).startsWith(SIMULATED_ALERT_PREFIX)).toBe(true);
    }
  });

  it('serves the sample label through the origin summary endpoint', async () => {
    const res = await get(
      'organisation_admin',
      `/projects/${sampleProjectId}/origin-summary`,
    ).expect(200);
    expect(res.body.sample_label).toBe(SAMPLE_LABEL);
    expect(res.body.counts.facilities.sample).toBeGreaterThan(0);
    expect(res.body.counts.facilities.real).toBeGreaterThan(0);
    expect(res.body.mixed).toBe(true);
    for (const a of res.body.alerts) {
      expect(a.label === null || a.label === SAMPLE_LABEL).toBe(true);
      if (a.simulated) expect(a.title_prefix).toBe(SIMULATED_ALERT_PREFIX);
    }
  });
});

describe('real data import validation', () => {
  it('serves templates without a session so plain download links work', async () => {
    const res = await request(app).get('/api/import-templates/facilities');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('facility_id,facility_name');
    expect(res.text).toContain('YOUR-FACILITY-ID');
    const json = await request(app).get('/api/import-templates/stock?format=json');
    expect(json.status).toBe(200);
    expect(json.body.fields.length).toBe(8);
  });

  it('provides templates with no invented facility data', () => {
    const f = facilityTemplateCsv();
    expect(f.split('\n')[0]).toContain('facility_id,facility_name');
    expect(f).toContain('YOUR-FACILITY-ID');
    expect(f).not.toMatch(/Hospital|PHC|Clinic/);
    expect(stockTemplateCsv()).toContain('usable_stock_units');
  });

  it('rejects bad rows instead of coercing them', () => {
    const csv = [
      'facility_id,facility_name,country,lat,lon,source',
      ',Missing Id,Nigeria,,,x', // missing facility_id
      'NG-A,,Nigeria,,,x', // missing facility_name
      'NG-B,No Source,Nigeria,,,', // missing source
      'NG-C,Duplicate,Nigeria,,,x',
      'NG-C,Duplicate again,Nigeria,,,x', // duplicate in file
      'NG-D,Bad Lat,Nigeria,99,30,x', // out of range
      'NG-E,Bad Lon,Nigeria,12,999,x', // out of range
      'NG-F,Outside Country,Nigeria,51.5,-0.1,x', // London
    ].join('\n');
    const res = validateFacilitiesCsv(csv);
    // The first occurrence of a duplicated id is kept; every later duplicate
    // is reported rather than silently merged.
    expect(res.accepted.map((f) => f.facility_id)).toEqual(['NG-C']);
    expect(res.rejections.length).toBe(7);
    expect(res.rejections.map((r) => r.reason).join(' ')).toMatch(/facility_id/);
  });

  it('rejects non-numeric, negative and future stock values', () => {
    const csv = [
      'facility_id,medicine,usable_stock_units,avg_daily_consumption,as_of_date,source',
      'NG-TEST-001,Amoxicillin,abc,1,2026-10-01,s',
      'NG-TEST-001,Amoxicillin,-5,1,2026-10-01,s',
      'NG-TEST-001,Amoxicillin,10,-1,2026-10-01,s',
      'NG-TEST-001,Amoxicillin,10,1,2999-01-01,s',
      'NG-TEST-001,Amoxicillin,10,1,not-a-date,s',
      'NG-UNKNOWN,Amoxicillin,10,1,2026-10-01,s',
    ].join('\n');
    const res = validateStockCsv(csv, new Set(['NG-TEST-001']));
    expect(res.accepted.length).toBe(0);
    expect(res.rejections.length).toBe(6);
  });

  it('flags identical coordinates on different facilities', () => {
    const csv = [
      'facility_id,facility_name,country,lat,lon,source',
      'NG-P,Post P,Nigeria,12,8.5,s',
      'NG-Q,Post Q,Nigeria,12,8.5,s',
    ].join('\n');
    const res = validateFacilitiesCsv(csv);
    expect(res.warnings.some((w) => /coordinate/i.test(w.reason))).toBe(true);
  });

  it('previews without writing, then commits and shows the data as real', async () => {
    const before = await q(
      `select count(*)::int as n from facilities where external_id like 'NG-TEST-%'`,
    );
    expect(before.rows[0].n).toBe(0);
    const prev = await post('data_analyst', `/projects/${projectId}/real-import/preview`, {
      facilities_csv: FACILITIES_CSV,
      stock_csv: STOCK_CSV,
    }).expect(200);
    expect(prev.body.committed).toBe(false);
    expect(prev.body.facilities.accepted).toBe(2);
    expect(prev.body.stock.accepted).toBe(1);
    const mid = await q(
      `select count(*)::int as n from facilities where external_id like 'NG-TEST-%'`,
    );
    expect(mid.rows[0].n).toBe(0);

    const commit = await post('data_analyst', `/projects/${projectId}/real-import/commit`, {
      facilities_csv: FACILITIES_CSV,
      stock_csv: STOCK_CSV,
      duplicate_policy: 'reject',
      file_name: 'ng-test.csv',
    });
    if (commit.status !== 201)
      console.log('COMMIT ERROR', commit.status, JSON.stringify(commit.body));
    expect(commit.status).toBe(201);
    expect(commit.body.committed).toBe(true);
    expect(commit.body.written.facilitiesWritten).toBe(2);
    expect(commit.body.written.stockWritten).toBe(1);

    const after = await q(
      `select external_id, data_origin from facilities where external_id like 'NG-TEST-%' order by 1`,
    );
    expect(after.rows.map((r) => r.data_origin)).toEqual(['real', 'real']);
    const stock = await q(
      `select i.data_origin, i.source, i.coverage_days, i.avg_daily_consumption, b.file_name
         from inventory_records i
         join data_import_batches b on b.id = i.import_batch_id
        where i.import_batch_id is not null and i.data_origin='real'`,
    );
    expect(stock.rows.length).toBe(1);
    expect(stock.rows[0].source).toContain('State HMIS export');
    expect(stock.rows[0].file_name).toBe('ng-test.csv');
    expect(Number(stock.rows[0].coverage_days)).toBe(30);
  });

  it('undid only that batch, leaving sample and other real rows intact', async () => {
    const batch = await q(
      `select id from data_import_batches where file_name='ng-test.csv' order by created_at desc limit 1`,
    );
    const res = await post('organisation_admin', `/import-batches/${batch.rows[0].id}/undo`, {});
    expect(res.status).toBe(200);
    expect(res.body.stock_removed).toBe(1);
    const left = await q(
      `select count(*)::int as n from inventory_records where data_origin='sample'`,
    );
    expect(left.rows[0].n).toBeGreaterThan(0);
    const real = await q(
      `select count(*)::int as n from facilities where external_id='RW-MWU-001' and data_origin='real'`,
    );
    expect(real.rows[0].n).toBe(1);
    await post('organisation_admin', `/import-batches/${batch.rows[0].id}/undo`, {}).expect(400);
  });

  it('refuses imports and clears for a read-only role', async () => {
    const res = await post('executive', `/projects/${projectId}/real-import/preview`, {
      facilities_csv: FACILITIES_CSV,
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/role|permit/i);
    const clear = await post('executive', `/projects/${projectId}/sample-data/clear`, {
      confirmation: CLEAR_CONFIRMATION,
    });
    expect(clear.status).toBe(403);
    const dry = await get('executive', `/projects/${projectId}/sample-data/dry-run`);
    expect(dry.status).toBe(403);
  });
});

describe('clear and restore sample data', () => {
  it('refuses to clear without the exact confirmation phrase', async () => {
    const ws = await get('organisation_admin', '/workspace').expect(200);
    const org = orgId;
    const result = await clearSampleData(db, org, projectId, ws.body.user.id, 'yes', null);
    expect(result.cleared).toBe(false);
    const still = await q(`select count(*)::int as n from facilities where data_origin='sample'`);
    expect(still.rows[0].n).toBeGreaterThan(0);
  });

  it('dry-run reports per-table sample/real counts before anything is deleted', async () => {
    const res = await get(
      'organisation_admin',
      `/projects/${projectId}/sample-data/dry-run`,
    ).expect(200);
    expect(res.body.confirmation_phrase).toBe(CLEAR_CONFIRMATION);
    expect(res.body.canClear).toBe(true);
    expect(res.body.counts.facilities.sample).toBeGreaterThan(0);
    expect(res.body.counts.facilities.real).toBe(1);
  });

  it('clears only sample rows, then restores the exact same counts', async () => {
    const before = await q(
      `select (select count(*)::int from facilities) as f,
              (select count(*)::int from inventory_records) as i,
              (select count(*)::int from operational_alerts) as a`,
    );
    const ws = await get('organisation_admin', '/workspace').expect(200);
    const org = orgId;

    const dry = await dryRunClear(db, org);
    expect(dry.canClear).toBe(true);

    const cleared = await clearSampleData(
      db,
      org,
      projectId,
      ws.body.user.id,
      CLEAR_CONFIRMATION,
      null,
    );
    expect(cleared.cleared).toBe(true);

    const after = await q(
      `select (select count(*)::int from facilities where data_origin='sample') as fs,
              (select count(*)::int from inventory_records where data_origin='sample') as ist,
              (select count(*)::int from operational_alerts where data_origin='sample') as al,
              (select count(*)::int from facilities where data_origin='real') as fr`,
    );
    expect(after.rows[0].fs).toBe(0);
    expect(after.rows[0].ist).toBe(0);
    expect(after.rows[0].al).toBe(0);
    expect(after.rows[0].fr).toBe(1);

    // Restore is idempotent and returns the original counts.
    const restore = await post(
      'organisation_admin',
      `/projects/${projectId}/sample-data/restore`,
      {},
    );
    expect(restore.status).toBe(200);
    {
      const restored = await q(
        `select (select count(*)::int from facilities) as f,
                (select count(*)::int from inventory_records) as i,
                (select count(*)::int from operational_alerts) as a`,
      );
      expect(restored.rows[0]).toEqual(before.rows[0]);
    }
  });

  it('aborts the clear when a real row references a sample row', async () => {
    const sampleFacility = await q(`select id from facilities where data_origin='sample' limit 1`);
    const ids = await q(
      `select id, organisation_id, project_id, version_id from inventory_records where data_origin='sample' limit 1`,
    );
    const src = ids.rows[0];
    await q(
      `insert into inventory_records
        (organisation_id, project_id, created_by, version_id, facility_id, product_id,
         reporting_date, opening_stock, quantity_received, quantity_dispensed, adjustments,
         closing_stock, usable_stock, reserved_stock, expired_stock, stockout_days,
         minimum_stock, maximum_stock, source_row, data_origin)
       select organisation_id, project_id, created_by, version_id, $1, product_id,
              reporting_date, 1,0,0,0,1,1,0,0,0,0,1,999,'real'
         from inventory_records where id=$2`,
      [sampleFacility.rows[0].id, src.id],
    );
    const ws = await get('organisation_admin', '/workspace').expect(200);
    const org = orgId;
    const dry = await dryRunClear(db, org);
    expect(dry.canClear).toBe(false);
    expect(dry.blockers.length).toBeGreaterThan(0);
    const attempt = await clearSampleData(
      db,
      org,
      projectId,
      ws.body.user.id,
      CLEAR_CONFIRMATION,
      null,
    );
    expect(attempt.cleared).toBe(false);
    const still = await q(`select count(*)::int as n from facilities where data_origin='sample'`);
    expect(still.rows[0].n).toBeGreaterThan(0);
    await q(`delete from inventory_records where source_row=999 and data_origin='real'`);
  });
});

describe('experiment lab prompts', () => {
  it('serves seven numbered prompts plus the context group', async () => {
    const res = await get('data_analyst', '/prompts').expect(200);
    expect(res.body.prompts.length).toBe(11);
    const main = res.body.prompts.filter(
      (p: { group: string }) => p.group !== 'Context prompts (no stock data needed)',
    );
    expect(main.length).toBe(7);
    expect(
      res.body.prompts.filter((p: { group: string }) => p.group.startsWith('Context')).length,
    ).toBe(4);
    expect(res.body.behaviour_rules).toEqual(BEHAVIOUR_RULES);
    for (const p of SAVED_PROMPTS) expect(p.prompt.length).toBeGreaterThan(40);
  });

  it('answers from the data in scope and states the scope used', async () => {
    const res = await post(
      'organisation_admin',
      `/projects/${sampleProjectId}/prompts/stockout-prioritisation/run`,
      {
        scope: 'sample',
      },
    ).expect(200);
    expect(res.body.status).toBe('answered');
    expect(res.body.scope_statement).toMatch(/Sample data only/);
    expect(res.body.uses_sample_data).toBe(true);
    expect(res.body.answer).toMatch(/coverage/);
    // Numbers in the answer must come from the returned rows.
    expect(res.body.rows.length).toBeGreaterThan(0);
    for (const r of res.body.rows) expect(r.data_origin).toBe('sample');
  });

  it('says exactly what is missing instead of inventing real data', async () => {
    const res = await post(
      'organisation_admin',
      `/projects/${sampleProjectId}/prompts/stockout-prioritisation/run`,
      {
        scope: 'real',
      },
    ).expect(200);
    expect(res.body.status).toBe('insufficient_data');
    expect(res.body.missing.length).toBeGreaterThan(0);
    expect(res.body.missing.join(' ')).toMatch(/real/i);
    expect(res.body.rows.length).toBe(0);
    expect(res.body.answer).toMatch(/Missing:/);
    expect(res.body.answer).not.toMatch(/\[Sample\]/);
  });

  it('flags the Horizon 1000 claim as unverified in the answer', async () => {
    const res = await post(
      'organisation_admin',
      `/projects/${sampleProjectId}/prompts/horizon-1000-alignment/run`,
      {
        scope: 'sample',
      },
    ).expect(200);
    expect(res.body.unverified_claims.length).toBeGreaterThan(0);
    if (res.body.status === 'answered') expect(res.body.answer).toMatch(/UNVERIFIED/);
  });

  it('labels the Horizon 1000 claims as unverified', () => {
    for (const id of [
      'horizon-1000-alignment',
      'south-africa-readiness',
      'context-horizon-1000-rwanda',
    ]) {
      const p = SAVED_PROMPTS.find((x) => x.id === id)!;
      expect(p.unverified_claims?.length).toBeGreaterThan(0);
      expect(p.unverified_claims!.join(' ')).toMatch(/UNVERIFIED/);
    }
  });
});
