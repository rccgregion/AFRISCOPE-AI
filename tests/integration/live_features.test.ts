import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createDatabase, type Database } from '../../server/db';
import { createApp } from '../../server/app';
import { seedDemo } from '../../server/seed';
import { DEMO_PROJECTS } from '../../shared/domain';

let db: Database, app: Express;
const agents: Record<string, ReturnType<typeof request.agent>> = {};
const [med] = DEMO_PROJECTS;
const path = (p: string) => '/api' + p;

beforeAll(async () => {
  db = await createDatabase({ path: ':memory:' });
  await seedDemo(db);
  app = createApp(db);

  for (const role of ['programme_manager', 'organisation_admin']) {
    agents[role] = request.agent(app);
    await agents[role]
      .post(path('/auth/demo'))
      .set('X-AfriScope-Request', '1')
      .send({ role })
      .expect(200);
  }
}, 60000);

afterAll(async () => {
  await db?.close();
});

describe('Live Data, Automated Backups, Supabase Webhooks, and GIS layers', () => {
  it('serves GeoJSON district boundaries and facility spatial metadata', async () => {
    const res = await request(app).get(path('/gis/districts')).expect(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features.length).toBeGreaterThanOrEqual(4);
    const first = res.body.features[0];
    expect(first.geometry.type).toBe('Polygon');
    expect(first.properties.name).toBeDefined();
    expect(first.properties.facilities.length).toBeGreaterThan(0);
  });

  it('manages backups: creates snapshot, lists entries, and supports download with checksum', async () => {
    const agent = agents.organisation_admin;

    // Trigger on-demand backup
    const createRes = await agent
      .post(path('/backups'))
      .set('X-AfriScope-Request', '1')
      .send({ label: 'Integration test backup' })
      .expect(201);

    expect(createRes.body.filename).toBeDefined();
    expect(createRes.body.checksum).toHaveLength(64);
    expect(createRes.body.record_count).toBeGreaterThan(0);

    // List backups
    const listRes = await agent.get(path('/backups')).expect(200);
    expect(listRes.body.backups.length).toBeGreaterThan(0);
    const created = listRes.body.backups.find(
      (b: { filename: string }) => b.filename === createRes.body.filename,
    );
    expect(created).toBeDefined();
    expect(created.backup_type).toBe('manual');

    // Download snapshot
    const dlRes = await agent
      .get(path(`/backups/${encodeURIComponent(createRes.body.filename)}/download`))
      .expect(200);

    expect(dlRes.headers['content-type']).toContain('application/json');
    expect(dlRes.body.version).toBe('1.0');
    expect(dlRes.body.data.facilities.length).toBeGreaterThan(0);
  });

  it('receives Supabase Database Webhook push events and broadcasts them', async () => {
    const webhookRes = await request(app)
      .post(path('/webhooks/supabase'))
      .set('X-AfriScope-Request', '1')
      .send({
        type: 'operational_alerts',
        event: 'INSERT',
        record: {
          id: 'test-webhook-alert-001',
          title: 'Critical Buffer Alert via Supabase Webhook',
          facility_name: 'St. Jude District Hospital',
          risk: 'Critical',
          triggering_condition: 'Simulated real-time stockout breach',
          category: 'stock_buffer',
        },
      })
      .expect(200);

    expect(webhookRes.body.received).toBe(true);
    expect(webhookRes.body.action).toBe('broadcast');
    expect(webhookRes.body.table).toBe('operational_alerts');
    expect(webhookRes.body.type).toBe('INSERT');
  });

  // Rewritten with the connector integrity fix: the old assertions required
  // invented results (status 'active', synced_records > 0, facility_count > 0)
  // from a connector that had never made a request. The contract is now that an
  // unconfigured connector refuses to sync and reports nothing.
  it('lists connectors as unconfigured and refuses to fabricate a sync', async () => {
    const agent = agents.programme_manager;

    const listRes = await agent.get(path(`/projects/${med}/connectors`)).expect(200);
    expect(listRes.body.connectors.length).toBeGreaterThanOrEqual(3);

    const dhis2 = listRes.body.connectors.find((c: { type: string }) => c.type === 'dhis2_api');
    expect(dhis2).toBeDefined();
    expect(dhis2.connection_mode).toBe('not_configured');
    expect(dhis2.rows_synced).toBeNull();
    expect(dhis2.last_sync_at).toBeNull();

    const syncRes = await agent
      .post(path(`/projects/${med}/connectors/${dhis2.id}/sync`))
      .set('X-AfriScope-Request', '1')
      .send({});
    expect(syncRes.status).toBe(409);
    expect(syncRes.body.status).toBe('not_configured');
    expect(syncRes.body.rowsSynced).toBeNull();
    expect(syncRes.body.result).toBeUndefined();
  });
});
