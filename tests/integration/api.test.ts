import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createDatabase, type Database } from '../../server/db';
import { createApp } from '../../server/app';
import { seedDemo, insert, demoUserId, bootstrapAdmin } from '../../server/seed';
import { DEMO_PROJECTS, DEMO_ORG } from '../../shared/domain';
let db: Database, app: Express;
const agents: Record<string, ReturnType<typeof request.agent>> = {};
const [med, fin, plan] = DEMO_PROJECTS;
const path = (p: string) => '/api' + p;
const post = (role: string, p: string, body: unknown) =>
  agents[role]
    .post(path(p))
    .set('X-AfriScope-Request', '1')
    .send(body as object);
beforeAll(async () => {
  db = await createDatabase({ path: ':memory:' });
  await seedDemo(db);
  app = createApp(db);
  for (const role of [
    'programme_manager',
    'data_analyst',
    'operator',
    'reviewer',
    'executive',
    'organisation_admin',
  ]) {
    agents[role] = request.agent(app);
    await post(role, '/auth/demo', { role }).expect(200);
  }
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe('authenticated API and database isolation', () => {
  it('bootstraps and signs in with a username, case-insensitively', async () => {
    await bootstrapAdmin(db, { username: 'TestUser' }, 'A-long-test-password-2026');
    const agent = request.agent(app);
    await agent
      .post(path('/auth/login'))
      .set('X-AfriScope-Request', '1')
      .send({ identifier: 'testuser', password: 'A-long-test-password-2026' })
      .expect(200);
    const w = await agent.get(path('/workspace')).expect(200);
    expect(w.body.user.username).toBe('testuser');
    expect(w.body.user.email).toBeNull();
    await agent
      .post(path('/auth/login'))
      .set('X-AfriScope-Request', '1')
      .send({ identifier: 'TESTUSER', password: 'wrong-password' })
      .expect(401);
    await expect(
      bootstrapAdmin(db, { username: 'testuser' }, 'Another-long-password-2026'),
    ).rejects.toThrow('Username already exists');
  });
  it('still supports email login and optional invitation username', async () => {
    await bootstrapAdmin(db, { email: 'EmailUser@example.test' }, 'A-long-test-password-2026');
    await request(app)
      .post(path('/auth/login'))
      .set('X-AfriScope-Request', '1')
      .send({ email: 'emailuser@example.test', password: 'A-long-test-password-2026' })
      .expect(200);
    const r = await post('organisation_admin', '/projects/' + med + '/invitations', {
      email: 'invite-username@example.test',
      role: 'reviewer',
    }).expect(201);
    const token = new URL('http://localhost' + r.body.path).searchParams.get('token');
    await request(app)
      .post(path('/auth/accept-invite'))
      .set('X-AfriScope-Request', '1')
      .send({
        token,
        full_name: 'Invite username',
        username: 'inviteuser',
        password: 'A-long-test-password-2026',
      })
      .expect(201);
    await request(app)
      .post(path('/auth/login'))
      .set('X-AfriScope-Request', '1')
      .send({ identifier: 'inviteuser', password: 'A-long-test-password-2026' })
      .expect(200);
  });
  it('health is public but workspace requires authentication', async () => {
    await request(app).get(path('/health')).expect(200);
    await request(app).get(path('/workspace')).expect(401);
  });
  it('rejects unsafe requests without CSRF header', async () => {
    await agents.programme_manager.post(path('/auth/logout')).send({}).expect(403);
  });
  it('rejects untrusted origin', async () => {
    await agents.programme_manager
      .post(path('/auth/demo'))
      .set('X-AfriScope-Request', '1')
      .set('Origin', 'https://untrusted.example')
      .send({ role: 'executive' })
      .expect(403);
  });
  it('returns all three projects and effective role', async () => {
    const r = await agents.reviewer.get(path('/workspace')).expect(200);
    expect(r.body.projects).toHaveLength(3);
    const p = await agents.reviewer.get(path('/projects/' + med)).expect(200);
    expect(p.body.my_role).toBe('reviewer');
  });
  it('denies cross-organisation project access', async () => {
    const other = await db.admin(async (c) => {
      const o = await insert(c, 'organisations', { name: 'Private test organisation' });
      return insert(c, 'projects', {
        organisation_id: o.id,
        title: 'Private project',
        sector: 'Public health',
        countries: 'Test',
      });
    });
    await agents.organisation_admin.get(path('/projects/' + other.id)).expect(403);
  });
  it('RLS hides other organisation rows', async () => {
    await db.scoped(demoUserId('executive'), async (c) => {
      expect((await c.query('select * from projects')).rows).toHaveLength(3);
      await expect(c.query('select * from auth_sessions')).rejects.toThrow('permission denied');
    });
  });
  it('rejects organisation/project mismatch in database', async () => {
    await expect(
      db.scoped(demoUserId('programme_manager'), (c) =>
        c.query(
          "insert into stakeholders(organisation_id,project_id,created_by,name) values($1,$2,$3,'bad')",
          [crypto.randomUUID(), med, demoUserId('programme_manager')],
        ),
      ),
    ).rejects.toThrow();
  });
  it('rejects cross-project foreign references in database', async () => {
    const f = await db.admin((c) => c.query('select id from facilities limit 1'));
    await expect(
      db.scoped(demoUserId('programme_manager'), (c) =>
        c.query(
          "insert into deliveries(organisation_id,project_id,created_by,external_id,facility_id,product_id,expected_date,quantity,unit,status) select $1,$2,$3,'bad',$4,product_id,'2026-10-10',1,'capsules','Pending' from inventory_records limit 1",
          [DEMO_ORG, fin, demoUserId('programme_manager'), f.rows[0].id],
        ),
      ),
    ).rejects.toThrow('Cross-project');
  });
  it('database prevents executive writes', async () => {
    await expect(
      db.scoped(demoUserId('executive'), (c) =>
        c.query(
          "insert into stakeholders(organisation_id,project_id,name) values($1,$2,'blocked')",
          [DEMO_ORG, med],
        ),
      ),
    ).rejects.toThrow();
  });
  it('database prevents evidence mutation', async () => {
    const unchanged = await db.scoped(demoUserId('programme_manager'), (c) =>
      c.query('update evidence_records set question=$1', [new Date().toISOString()]),
    );
    expect(unchanged.affectedRows).toBe(0);
  });
  it('computes 48 current stock records without transferring stock', async () => {
    const before = await db.admin((c) =>
      c.query('select sum(usable_stock)::int as n from inventory_records'),
    );
    const r = await agents.data_analyst.get(path('/projects/' + med + '/stock')).expect(200);
    expect(r.body.rows).toHaveLength(48);
    expect(r.body.rows.some((x: { risk: string }) => x.risk === 'Critical')).toBe(true);
    const after = await db.admin((c) =>
      c.query('select sum(usable_stock)::int as n from inventory_records'),
    );
    expect(after.rows).toEqual(before.rows);
  });
  it('does not reuse donor stock across proposals', async () => {
    const r = await agents.data_analyst.get(path('/projects/' + med + '/stock')).expect(200);
    const totals = new Map<string, number>();
    for (const row of r.body.rows) {
      const t = row.transfer_opportunity;
      if (t) totals.set(t.donor_id, (totals.get(t.donor_id) || 0) + t.quantity);
    }
    for (const row of r.body.rows)
      if (totals.has(row.facility_id))
        expect(totals.get(row.facility_id)).toBeLessThanOrEqual(row.usable_stock);
  });
  it('evaluates 48 series on held-out data', async () => {
    const r = await agents.data_analyst.get(path('/projects/' + med + '/forecast')).expect(200);
    expect(r.body.series_evaluated).toBe(48);
    expect(r.body.test).toHaveLength(2);
    expect(r.body.test[0].n).toBe(432);
  });
  it('keeps finance currencies separate and unmatched payments visible', async () => {
    const r = await agents.executive.get(path('/projects/' + fin + '/finance')).expect(200);
    expect(r.body.by_currency.map((x: { currency: string }) => x.currency).sort()).toEqual([
      'KES',
      'NGN',
    ]);
    expect(r.body.unmatched.length).toBeGreaterThan(0);
  });
  it('executive cannot run analysis or create records', async () => {
    await post('executive', '/projects/' + med + '/analysis', { kind: 'inventory' }).expect(403);
    await post('executive', '/projects/' + med + '/records/stakeholders', {
      name: 'Blocked',
    }).expect(403);
  });
  it('operator cannot import or approve', async () => {
    await post('operator', '/projects/' + med + '/analysis', { kind: 'inventory' }).expect(403);
  });
  it('persists analysis, evidence and immutable source lineage', async () => {
    const r = await post('data_analyst', '/projects/' + med + '/analysis', {
      kind: 'inventory',
    }).expect(200);
    const e = await db.scoped(demoUserId('data_analyst'), (c) =>
      c.query('select * from evidence_records where id=$1', [r.body.evidence_id]),
    );
    expect(e.rows[0].source_versions).toHaveLength(1);
    expect(e.rows[0].run_id).toBeTruthy();
  });
  it('validates uploads before commit and retains rejected rows', async () => {
    const csv =
      'external_id,programme_code,programme_name,currency,period,amount\nB-TEST,P-TEST,Test,NGN,2026-Q3,10.25\nB-BAD,P-TEST,Test,NGN,2026-Q3,-1\n';
    const preview = await agents.data_analyst
      .post(path('/projects/' + fin + '/imports/preview'))
      .set('X-AfriScope-Request', '1')
      .field('kind', 'budgets')
      .attach('file', Buffer.from(csv), 'test.csv')
      .expect(201);
    expect(
      (
        await db.admin((c) =>
          c.query('select count(*)::int as n from budgets where external_id=$1', ['B-TEST']),
        )
      ).rows[0].n,
    ).toBe(0);
    const r = await post('data_analyst', '/imports/' + preview.body.id + '/commit', {
      name: 'Integration test budget',
      mapping: Object.fromEntries(
        ['external_id', 'programme_code', 'programme_name', 'currency', 'period', 'amount'].map(
          (k) => [k, k],
        ),
      ),
    }).expect(201);
    expect(r.body.job.accepted_count).toBe(1);
    expect(r.body.job.rejected_count).toBe(1);
    expect(r.body.version.row_count).toBe(1);
    const rejection = await agents.data_analyst
      .get(path('/imports/' + preview.body.id + '/rejections'))
      .expect(200);
    expect(rejection.text).toContain('B-BAD');
    await post('data_analyst', '/imports/' + preview.body.id + '/commit', {
      name: 'Repeat',
      mapping: {},
    }).expect(404);
  });
  it('fully rejected import retains history without replacing analytical data', async () => {
    const preview = await agents.data_analyst
      .post(path('/projects/' + fin + '/imports/preview'))
      .set('X-AfriScope-Request', '1')
      .field('kind', 'budgets')
      .attach(
        'file',
        Buffer.from(
          'external_id,programme_code,programme_name,currency,period,amount\nBAD,P,Test,NGN,2026-Q3,-1\n',
        ),
        'bad.csv',
      )
      .expect(201);
    const before = await db.admin((c) =>
      c.query('select count(*)::int as n from dataset_versions'),
    );
    const r = await post('data_analyst', '/imports/' + preview.body.id + '/commit', {
      name: 'All rejected',
      mapping: Object.fromEntries(
        ['external_id', 'programme_code', 'programme_name', 'currency', 'period', 'amount'].map(
          (k) => [k, k],
        ),
      ),
    }).expect(201);
    expect(r.body.version).toBeNull();
    expect(r.body.job.status).toBe('Rejected');
    expect(r.body.job.rejected_count).toBe(1);
    expect(
      (await db.admin((c) => c.query('select count(*)::int as n from dataset_versions'))).rows,
    ).toEqual(before.rows);
  });
  it('rejects malformed CSV', async () => {
    await agents.data_analyst
      .post(path('/projects/' + fin + '/imports/preview'))
      .set('X-AfriScope-Request', '1')
      .field('kind', 'budgets')
      .attach('file', Buffer.from('a,b\n"unclosed,2'), 'bad.csv')
      .expect(400);
  });
  it('creates exact scenario and traceable recommendation', async () => {
    const r = await post('programme_manager', '/projects/' + plan + '/scenarios', {
      name: 'Integration constrained scenario',
      budget: 90000,
      currency: 'USD',
      equity_minimum: 1,
      max_months: 12,
      required_geographies: [],
      required_options: [],
    }).expect(201);
    expect(r.body.result.feasible).toBe(true);
    expect(r.body.recommendation_id).toBeTruthy();
    expect(r.body.option_snapshot).toHaveLength(8);
  });
  it('explains infeasible constraints without inventing a solution', async () => {
    const r = await post('programme_manager', '/projects/' + plan + '/scenarios', {
      name: 'Infeasible test',
      budget: 1,
      currency: 'USD',
      equity_minimum: 1,
      max_months: 1,
      required_geographies: ['Absent region'],
      required_options: [],
    }).expect(201);
    expect(r.body.result.feasible).toBe(false);
    expect(r.body.result.reasons.length).toBeGreaterThan(0);
  });
  it('enforces independent review and records outcome', async () => {
    const created = await post('programme_manager', '/projects/' + med + '/recommendations', {
      title: 'Integration review',
      problem: 'Synthetic test',
      action: 'Verify local stock',
      benefit: 'Test only',
      evidence_id: (await agents.programme_manager.get(path('/projects/' + med)).expect(200)).body
        .evidence_records[0].id,
    }).expect(201);
    const id = created.body.id;
    await post('programme_manager', '/recommendations/' + id + '/transition', {
      state: 'Under Review',
      reason: 'Ready for independent review',
    }).expect(200);
    await post('programme_manager', '/recommendations/' + id + '/transition', {
      state: 'Approved',
      reason: 'Self approval blocked',
    }).expect(403);
    await post('reviewer', '/recommendations/' + id + '/transition', {
      state: 'Approved',
      reason: 'Synthetic evidence reviewed',
    }).expect(200);
    await post('operator', '/recommendations/' + id + '/transition', {
      state: 'Implemented',
      reason: 'Recorded only',
      note: 'Synthetic verification recorded; no stock moved',
    }).expect(200);
    await post('operator', '/recommendations/' + id + '/transition', {
      state: 'Outcome Reviewed',
      reason: 'Follow-up',
      note: 'No real-world outcome measured',
    }).expect(200);
    const data = await agents.reviewer.get(path('/projects/' + med)).expect(200);
    expect(
      data.body.approvals.some((a: { recommendation_id: string }) => a.recommendation_id === id),
    ).toBe(true);
  });
  it('creates atomic project and creator membership under RLS', async () => {
    const r = await post('programme_manager', '/projects', {
      organisation_id: DEMO_ORG,
      title: 'Atomic project test',
      sector: 'Public health',
      countries: 'Synthetic',
      description: '',
    }).expect(201);
    const p = await agents.programme_manager.get(path('/projects/' + r.body.id)).expect(200);
    expect(p.body.members).toHaveLength(1);
    await post('executive', '/projects', {
      organisation_id: DEMO_ORG,
      title: 'Blocked',
      sector: 'Public health',
      countries: 'Synthetic',
    }).expect(403);
  });
  it('grades learning server-side and keeps progress private', async () => {
    const data = await agents.operator.get(path('/projects/' + med)).expect(200);
    const m = data.body.learning_modules.find(
      (m: { content: { quiz: unknown[] } }) => m.content.quiz?.length,
    );
    const r = await post('operator', '/learning/' + m.id + '/submit', {
      answers: { 0: 0, 1: 1 },
    }).expect(200);
    expect(r.body.score).toBe(100);
    const other = await agents.reviewer.get(path('/projects/' + med)).expect(200);
    expect(other.body.learning_progress.some((p: { id: string }) => p.id === r.body.id)).toBe(
      false,
    );
  });
  it('assistant is explicitly local and cites project evidence', async () => {
    const r = await post('executive', '/projects/' + med + '/assistant', {
      question: 'Which medicine stock risks need attention?',
    }).expect(200);
    expect(r.body.mode).toBe('Local deterministic assistant');
    expect(r.body.evidence_ids).toHaveLength(1);
    expect(r.body.answer).toContain('not authorised transfers');
  });
  it('exports a report with source versions and synthetic caveat', async () => {
    const data = await agents.executive.get(path('/projects/' + med)).expect(200);
    const r = await agents.executive
      .get(path('/reports/' + data.body.reports[0].id + '/export'))
      .expect(200);
    expect(r.text).toContain('Synthetic');
    expect(r.text).toContain('version');
  });
  it('formula-escapes exported text', async () => {
    await post('programme_manager', '/projects/' + med + '/records/stakeholders', {
      name: '=HYPERLINK("https://example.test")',
      role: 'Test',
    }).expect(201);
    const r = await agents.executive
      .get(path('/projects/' + med + '/export/stakeholders'))
      .expect(200);
    expect(r.text).toContain("'=HYPERLINK");
  });
  it('denies demo reset to non-admin and requires typed confirmation', async () => {
    await post('programme_manager', '/demo/reset', { confirmation: 'RESET' }).expect(403);
    await post('organisation_admin', '/demo/reset', { confirmation: 'wrong' }).expect(400);
  });
  it('issues single-use invitations bound to an email', async () => {
    const r = await post('organisation_admin', '/projects/' + med + '/invitations', {
      email: 'new-test@example.test',
      role: 'reviewer',
    }).expect(201);
    const token = new URL('http://localhost' + r.body.path).searchParams.get('token');
    await request(app)
      .post(path('/auth/accept-invite'))
      .set('X-AfriScope-Request', '1')
      .send({ token, full_name: 'Test reviewer', password: 'A-long-test-password-2026' })
      .expect(201);
    await request(app)
      .post(path('/auth/accept-invite'))
      .set('X-AfriScope-Request', '1')
      .send({ token, full_name: 'Test reviewer', password: 'A-long-test-password-2026' })
      .expect(400);
  });
});
