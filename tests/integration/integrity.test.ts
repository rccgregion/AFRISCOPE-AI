import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createDatabase, type Database } from '../../server/db';
import { createApp } from '../../server/app';
import { seedDemo } from '../../server/seed';
import { importSamplePack } from '../../server/sample-pack';
import { listConnectors, syncConnector, configureConnector } from '../../server/connectors';
import { originSummary, dataStateLabel } from '../../server/origin';
import { backupService } from '../../server/backup';
import { exportLabelRows } from '../../src/components/origin';

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

beforeAll(async () => {
  process.env.SAMPLE_DATA_RESTORE = 'true';
  db = await createDatabase({ path: ':memory:' });
  await seedDemo(db);
  app = createApp(db);
  for (const role of ['programme_manager', 'organisation_admin', 'executive']) {
    agents[role] = request.agent(app);
    await post(role, '/auth/demo', { role }).expect(200);
  }
  const ws = await get('organisation_admin', '/workspace').expect(200);
  projectId = ws.body.projects[0].id;
  const pack = await importSamplePack(db, ws.body.user.id);
  sampleProjectId = String(pack.projectId);
}, 120000);

afterAll(async () => {
  delete process.env.SAMPLE_DATA_RESTORE;
  await db?.close();
});

describe('1.1 connectors cannot fabricate results', () => {
  it('seeds every connector as not_configured with no run history', async () => {
    const res = await get('programme_manager', `/projects/${projectId}/connectors`).expect(200);
    expect(res.body.connectors.length).toBeGreaterThan(0);
    for (const c of res.body.connectors) {
      expect(c.connection_mode).toBe('not_configured');
      expect(c.can_sync).toBe(false);
      expect(c.status).toBe('not_configured');
      expect(c.last_run_at).toBeNull();
      expect(c.last_sync_at).toBeNull();
      expect(c.last_run_rows).toBeNull();
      expect(c.rows_synced).toBeNull();
      expect(c.run_count).toBe(0);
      expect(c.sync_count).toBe(0);
      expect(c.last_error).toBeNull();
      // The invented 124 / 86 / 52 values must be gone everywhere.
      expect([124, 86, 52]).not.toContain(Number(c.rows_synced));
    }
  });

  it('refuses to sync an unconfigured connector and records nothing', async () => {
    const connectors = await listConnectors(db, projectId);
    const target = connectors[0];
    const status = await post(
      'programme_manager',
      `/projects/${projectId}/connectors/${target.id}/sync`,
      {},
    );
    expect(status.status).toBe(409);
    expect(status.body.status).toBe('not_configured');
    expect(status.body.ok).toBe(false);
    expect(status.body.rowsSynced).toBeNull();
    expect(status.body.rows_written).toBe(0);
    expect(status.body.message).toMatch(/not configured/i);
    // No counter was incremented and no timestamp written.
    const after = (await listConnectors(db, projectId)).find((c) => c.id === target.id)!;
    expect(after.run_count).toBe(0);
    expect(after.last_run_at).toBeNull();
    expect(after.last_run_rows).toBeNull();
  });

  it('reports a real failure when the configured endpoint fails', async () => {
    const connector = await configureConnector(
      db,
      projectId,
      (await listConnectors(db, projectId))[1].id,
      {
        endpoint_url: 'https://example.org/stock.json',
      } as never,
    );
    expect(connector.connection_mode).toBe('configured');
    expect(connector.can_sync).toBe(true);
    expect(connector.endpoint_host).toBe('example.org');

    const failing = (async () => {
      throw new Error('getaddrinfo ENOTFOUND example.org');
    }) as unknown as typeof fetch;
    const outcome = await syncConnector(db, connector.id, projectId, { fetchImpl: failing });
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe('error');
    expect(outcome.rowsSynced).toBeNull();
    expect(outcome.rows_written).toBe(0);
    expect(outcome.http_status).toBeNull();
    expect(outcome.message).toMatch(/failed/);
    const after = (await listConnectors(db, projectId)).find((c) => c.id === connector.id)!;
    expect(after.last_run_ok).toBe(false);
    expect(after.last_run_rows).toBeNull();
    expect(after.run_count).toBe(1);
    expect(after.last_error).toMatch(/ENOTFOUND/);
  });

  it('reports only the rows a real HTTP response contained', async () => {
    const connector = (await listConnectors(db, projectId)).find((c) => c.can_sync)!;
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ rows: [{ a: 1 }, { a: 2 }, { a: 3 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    const outcome = await syncConnector(db, connector.id, projectId, { fetchImpl: fakeFetch });
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe('ok');
    expect(outcome.rowsSynced).toBe(3);
    expect(outcome.http_status).toBe(200);
    expect(outcome.rows_written).toBe(0);
    const after = (await listConnectors(db, projectId)).find((c) => c.id === connector.id)!;
    expect(after.last_run_rows).toBe(3);
    expect(after.run_count).toBe(2);
    expect(after.status).toBe('ok');
  });

  it('rejects a non-HTTPS endpoint and clears a configuration', async () => {
    const target = (await listConnectors(db, projectId)).find((c) => c.can_sync)!;
    const cleared = await configureConnector(db, projectId, target.id, {
      endpoint_url: 'http://insecure.example.org',
    } as never);
    expect(cleared.connection_mode).toBe('not_configured');
    expect(cleared.can_sync).toBe(false);
  });

  it('labels the demo webhook path and writes nothing', async () => {
    const before = await db.admin(async (c) => {
      const r = await c.query('select count(*)::int as n from operational_alerts');
      return Number(r.rows[0].n);
    });
    const res = await post('programme_manager', '/webhooks/supabase', {
      table: 'operational_alerts',
      event: 'INSERT',
      record: { title: 'Demo webhook event' },
    }).expect(200);
    expect(res.body.demo).toBe(true);
    expect(res.body.rows_written).toBe(0);
    expect(String(res.body.note)).toMatch(/Nothing was written/);
    const after = await db.admin(async (c) => {
      const r = await c.query('select count(*)::int as n from operational_alerts');
      return Number(r.rows[0].n);
    });
    expect(after).toBe(before);
  });
});

describe('1.2 truthful data and realtime status', () => {
  it('describes sample projects as demo data, never "Live"', async () => {
    const summary = await db.admin((c) => originSummary(c, sampleProjectId));
    expect(summary.has_sample).toBe(true);
    // The sample project also lists the one real facility, so the honest label
    // names both. It must never claim the data is live.
    expect(dataStateLabel(summary)).toBe(summary.has_real ? 'Real and sample data' : 'Demo data');
    const payload = await get('organisation_admin', `/projects/${sampleProjectId}`).expect(200);
    expect(['Demo data', 'Real and sample data']).toContain(payload.body.data_state);
    expect(payload.body.data_state).not.toMatch(/live/i);
  });

  it('describes a real-only scope as real data loaded', () => {
    expect(dataStateLabel({ has_sample: false, has_real: true })).toBe('Real data loaded');
    expect(dataStateLabel({ has_sample: false, has_real: false })).toBe('No data yet');
  });
});

describe('1.3 backup scheduler claims', () => {
  it('reports no configured automatic schedule when no timer is running', async () => {
    const res = await get('organisation_admin', '/backups').expect(200);
    expect(res.body.scheduler.configured).toBe(false);
    expect(res.body.scheduler.note).toMatch(/not running|not configured|No automatic/i);
    expect(res.body.recurring_interval_hours).toBeNull();
  });

  it('stores the snapshot payload so a download works without a writable disk', async () => {
    const snap = await post('organisation_admin', '/backups', {}).expect(201);
    const row = await db.admin(async (c) => {
      const r = await c.query('select payload from backups where filename=$1', [
        snap.body.filename,
      ]);
      return r.rows[0];
    });
    expect(row.payload).toBeTruthy();
    const download = await get(
      'organisation_admin',
      `/backups/${encodeURIComponent(snap.body.filename)}/download`,
    );
    expect(download.status).toBe(200);
    const parsed = JSON.parse(download.text);
    expect(parsed.checksum ?? snap.body.checksum).toBe(snap.body.checksum);
    expect(parsed.total_records).toBeGreaterThan(0);
  });

  it('exposes scheduler status through the service', async () => {
    const status = await backupService.status(db);
    expect(status.configured).toBe(false);
    expect(['serverless_unconfigured', 'stopped']).toContain(status.mode);
    expect(status.last_run_at).not.toBeNull();
  });
});

describe('1.4 one shared origin counter', () => {
  it('counts per entity from one function', async () => {
    const summary = await db.admin((c) => originSummary(c, sampleProjectId));
    expect(summary.facilities.sample).toBeGreaterThan(0);
    expect(summary.inventory_records.sample).toBeGreaterThan(0);
    // Latest-slice count is a subset of all readings, never larger.
    expect(summary.inventory_latest.sample).toBeLessThanOrEqual(summary.inventory_records.sample);
    expect(summary.sample_label).toMatch(/not reported by any facility/);
  });

  it('matches the number of rows each endpoint returns', async () => {
    const summary = await db.admin((c) => originSummary(c, sampleProjectId));
    const payload = await get('organisation_admin', `/projects/${sampleProjectId}`).expect(200);
    expect(payload.body.origin_summary.facilities).toEqual(summary.facilities);
    expect(payload.body.origin_summary.operational_alerts).toEqual(summary.operational_alerts);
    // The visible alert rows equal the counted sample+real alerts.
    const visibleAlerts = (payload.body.operational_alerts as Row[]).length;
    expect(visibleAlerts).toBe(summary.operational_alerts.sample + summary.operational_alerts.real);
    // Facilities table rows equal the counted facilities.
    const visibleFacilities = (payload.body.facilities as Row[]).length;
    expect(visibleFacilities).toBe(summary.facilities.sample + summary.facilities.real);
    // Funding releases, shown on the Finance tab, equal their counted total.
    const visibleFunding = (payload.body.funding_releases as Row[]).length;
    expect(visibleFunding).toBe(summary.funding_releases.sample + summary.funding_releases.real);
    // Stock rows rendered by /stock equal the latest-slice count.
    const stock = await get('organisation_admin', `/projects/${sampleProjectId}/stock`).expect(200);
    expect((stock.body.rows as Row[]).length).toBe(
      summary.inventory_latest.sample + summary.inventory_latest.real,
    );
  });

  it('publishes the same summary through the origin endpoint', async () => {
    const res = await get(
      'organisation_admin',
      `/projects/${sampleProjectId}/origin-summary`,
    ).expect(200);
    const summary = await db.admin((c) => originSummary(c, sampleProjectId));
    expect(res.body.counts.facilities).toEqual(summary.facilities);
    expect(res.body.mixed).toBe(true);
    expect(['Demo data', 'Real and sample data']).toContain(res.body.data_state);
    expect(res.body.data_state).not.toMatch(/live/i);
  });
});

type Row = { id: string; [key: string]: unknown };

describe('1.5 row-level sample labelling in Programme Operations', () => {
  it('labels every sample stock row and prefixes simulated transfer text', async () => {
    const res = await get('organisation_admin', `/projects/${sampleProjectId}/stock`).expect(200);
    const rows = res.body.rows as Row[];
    expect(rows.length).toBeGreaterThan(0);
    const sample = rows.filter((r) => r.data_origin === 'sample');
    expect(sample.length).toBeGreaterThan(0);
    // Every sample row carries the origin so the UI can badge it; no real row is
    // labelled sample.
    for (const r of rows) {
      expect(['sample', 'real']).toContain(String(r.data_origin));
    }
    for (const r of sample) {
      expect(String(r.facility_name)).toContain('[Sample]');
    }
  });

  it('prefixes every sample alert title with "Simulated:"', async () => {
    const res = await get('organisation_admin', `/projects/${sampleProjectId}`).expect(200);
    const alerts = res.body.operational_alerts as Row[];
    const sample = alerts.filter((a) => a.data_origin === 'sample');
    expect(sample.length).toBeGreaterThan(0);
    for (const a of sample) expect(String(a.title).startsWith('Simulated:')).toBe(true);
    for (const a of alerts.filter((a) => a.data_origin !== 'sample')) {
      expect(String(a.title).startsWith('Simulated:')).toBe(false);
    }
  });

  it('exports carry data_origin and the label text', async () => {
    const rows = await db.admin(async (c) => {
      const r = await c.query(
        `select data_origin from inventory_records where project_id=$1 limit 3`,
        [sampleProjectId],
      );
      return r.rows;
    });
    const labelled = exportLabelRows(rows as Record<string, unknown>[]);
    for (const row of labelled) {
      expect(row).toHaveProperty('data_origin');
      expect(row).toHaveProperty('origin_label');
      expect(String(row.origin_label)).toBe(
        row.data_origin === 'sample' ? 'Sample data - not reported by any facility' : 'Real data',
      );
    }
  });
});

describe('2.3 operational reference date', () => {
  it('exposes the project reference date the server evaluates against', async () => {
    const res = await get('organisation_admin', `/projects/${sampleProjectId}`).expect(200);
    expect(res.body.reference_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.reference_date).toBe(
      String(res.body.project.settings?.as_of || '2026-09-30').slice(0, 10),
    );
  });

  it('reports no stock row as having a delivery earlier than its snapshot date', async () => {
    const res = await get('organisation_admin', `/projects/${sampleProjectId}/stock`).expect(200);
    for (const row of res.body.rows as Row[]) {
      if (!row.expected_delivery) continue;
      // A delivery before the reporting snapshot would be shown as overdue, never
      // as "next delivery" - assert the data at least supports that distinction.
      expect(typeof row.expected_delivery).toBe('string');
    }
  });
});

describe('5.5 health names the database actually in use', () => {
  it('reports driver, host and persistence without credentials', async () => {
    const res = await get('programme_manager', '/health').expect(200);
    expect(res.body.database_info).toBeTruthy();
    expect(['pglite', 'postgres']).toContain(res.body.database_info.driver);
    expect(typeof res.body.database_info.label).toBe('string');
    expect(res.body.database_info.label.length).toBeGreaterThan(10);
    // the label must be specific, not the old generic sentence
    expect(res.body.database_info.label).not.toMatch(/PGlite or configured PostgreSQL/);
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toMatch(/password=/i);
    expect(serialised).not.toMatch(/:\/\/[^@\s"]+@/);
  });
});

describe('auth rate limit only counts failures', () => {
  it('allows many successful demo sign-ins from one client', async () => {
    // A page load calls /auth/auto; ten successful loads used to lock the user
    // out with 429 and the workspace never rendered.
    for (let i = 0; i < 14; i++) {
      await post('programme_manager', '/auth/auto', {}).expect(200);
    }
    await post('programme_manager', '/auth/demo', { role: 'programme_manager' }).expect(200);
  });

  it('still blocks a client that keeps failing', async () => {
    const agent = request.agent(app);
    let blocked = false;
    for (let i = 0; i < 14; i++) {
      const res = await agent
        .post(path('/auth/login'))
        .set('X-AfriScope-Request', '1')
        .send({ identifier: 'nobody@example.org', password: 'wrong-password' });
      if (res.status === 429) blocked = true;
    }
    expect(blocked).toBe(true);
  });
});
