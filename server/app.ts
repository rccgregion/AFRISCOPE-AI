import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { can, ROLES, DEMO_ORG, AS_OF, type Role, type RecommendationState } from '../shared/domain';
import { transition, optimise, type Constraints } from '../shared/analytics';
import { tables } from './schema.mjs';
import { audit, one, type Database, type Client } from './db';
import {
  context,
  json,
  stockAnalysis,
  forecastAnalysis,
  financeAnalysis,
  saveScenario,
  saveEvidence,
  createRecommendation,
  reportMarkdown,
  latestVersion,
  checksum,
} from './services';
import { insert, demoUserId, seedDemo } from './seed';
import {
  uuid,
  text,
  date,
  projectSchema,
  mappingSchema,
  requiredFields,
  validateRows,
  qualityReport,
  type RawRow,
} from './validation';
import { explain } from './assistant';

type Authed = Request & {
  user: { id: string; email: string; full_name: string; is_platform_admin: boolean };
  sessionHash: string;
};

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const cookieName = 'afriscope_session';
const safeUser = 'id,email,full_name,is_platform_admin,preferences';
const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
export function createApp(db: Database) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      const allowed = new Set(
        [
          process.env.APP_ORIGIN,
          `http://${req.headers.host}`,
          `https://${req.headers.host}`,
        ].filter(Boolean),
      );
      if ((origin && !allowed.has(origin)) || req.get('X-AfriScope-Request') !== '1') {
        next(httpError(403, 'Request origin or CSRF header rejected'));
        return;
      }
    }
    next();
  });
  const session = async (req: Request, res: Response, user: string) => {
    const token = randomBytes(32).toString('base64url');
    await db.admin(async (c) => {
      await c.query('delete from auth_sessions where expires_at<now()');
      await c.query(
        "insert into auth_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '8 hours')",
        [hash(token), user],
      );
    });
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 3600000,
      path: '/',
    });
  };
  const auth = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = (req as Authed).cookies?.[cookieName] || req.cookies?.[cookieName];
      if (typeof token !== 'string' || token.length > 100)
        throw httpError(401, 'Sign in to access a workspace');
      const record = (
        await db.admin((c) =>
          c.query(
            `select u.id,u.email,u.full_name,u.is_platform_admin,u.preferences,s.token_hash from auth_sessions s join user_profiles u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()`,
            [hash(token)],
          ),
        )
      ).rows[0];
      if (!record) throw httpError(401, 'Session expired. Sign in again.');
      Object.assign(req, { user: record, sessionHash: record.token_hash });
      next();
    } catch (e) {
      next(e);
    }
  };
  const scoped = <T>(req: Request, fn: (c: Client) => Promise<T>) =>
    db.scoped((req as Authed).user.id, fn);
  const permission = async (req: Request, p: string, projectId: string) =>
    scoped(req, async (c) => {
      const r = await one(c, 'select project_role($1) as role', [projectId]);
      if (!can(r.role as Role, p as 'read'))
        throw httpError(403, 'Your project role does not permit this action');
      return r.role as Role;
    });
  const route = (
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    fn: (req: Request, res: Response) => Promise<unknown>,
    protect = true,
  ) => {
    if (protect) app[method]('/api' + path, auth, asyncRoute(fn));
    else app[method]('/api' + path, asyncRoute(fn));
  };
  // The preceding helper deliberately keeps authentication ahead of every protected handler.
  app.use('/api', (_req, res, next) => {
    if (res.headersSent) return next();
    next();
  });
  route(
    'get',
    '/health',
    async (_req, res) => {
      await db.admin((c) => c.query('select 1'));
      res.json({
        status: 'ok',
        database: 'PostgreSQL / PGlite or configured PostgreSQL',
        llm:
          process.env.LLM_EXTERNAL_ENABLED === 'true' && !!process.env.LLM_API_KEY
            ? 'configured — not health-checked'
            : 'local deterministic fallback',
        demo: process.env.DEMO_ENABLED !== 'false',
      });
    },
    false,
  );
  route(
    'post',
    '/auth/demo',
    async (req, res) => {
      if (process.env.DEMO_ENABLED === 'false') throw httpError(403, 'Demo access is disabled');
      const role = z
        .enum([
          'programme_manager',
          'data_analyst',
          'operator',
          'reviewer',
          'executive',
          'organisation_admin',
        ])
        .parse(req.body.role || 'programme_manager');
      await session(req, res, demoUserId(role));
      res.json({ ok: true, role });
    },
    false,
  );
  route(
    'post',
    '/auth/login',
    async (req, res) => {
      const { email, password } = z
        .object({ email: z.string().email().max(254), password: z.string().min(1).max(256) })
        .parse(req.body);
      const key = hash(email.toLowerCase());
      const ok = await db.admin(async (c) => {
        const t = (await c.query('select * from auth_throttle where key=$1', [key])).rows[0];
        if (t && Number(t.attempts) >= 8 && new Date(String(t.reset_at)) > new Date())
          throw httpError(429, 'Too many attempts. Try again in 15 minutes.');
        await c.query(
          "insert into auth_throttle(key,attempts,reset_at) values($1,1,now()+interval '15 minutes') on conflict(key) do update set attempts=case when auth_throttle.reset_at<now() then 1 else auth_throttle.attempts+1 end,reset_at=case when auth_throttle.reset_at<now() then now()+interval '15 minutes' else auth_throttle.reset_at end",
          [key],
        );
        const u = (
          await c.query('select * from user_profiles where email=$1', [email.toLowerCase()])
        ).rows[0];
        const stored = String(
          u?.password_hash || 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128),
        );
        const [_, salt, hex] = stored.split(':');
        const actual = scryptSync(password, salt, 64),
          expected = Buffer.from(hex, 'hex');
        if (
          !u?.password_hash ||
          actual.length !== expected.length ||
          !timingSafeEqual(actual, expected)
        )
          return null;
        await c.query('delete from auth_throttle where key=$1', [key]);
        return u;
      });
      if (!ok) throw httpError(401, 'Email or password is incorrect');
      await session(req, res, String(ok.id));
      res.json({ ok: true });
    },
    false,
  );
  route('post', '/auth/logout', async (req, res) => {
    await db.admin((c) =>
      c.query('delete from auth_sessions where token_hash=$1', [(req as Authed).sessionHash]),
    );
    res.clearCookie(cookieName, { path: '/' });
    res.json({ ok: true });
  });
  route(
    'post',
    '/auth/recovery',
    async (_req, res) => {
      res.json({
        message:
          'Password recovery by email is not configured. Contact your organisation administrator to verify your identity and reset access. No email has been sent.',
      });
    },
    false,
  );
  route('get', '/workspace', async (req, res) => {
    const data = await scoped(req, async (c) => ({
      user: await one(c, `select ${safeUser} from user_profiles where id=app_uid()`),
      memberships: (
        await c.query(
          'select om.organisation_id,om.role,o.name organisation_name from organisation_memberships om join organisations o on o.id=om.organisation_id where om.user_id=app_uid()',
        )
      ).rows,
      projects: (await c.query('select * from projects order by created_at')).rows,
      organisations: (await c.query('select * from organisations order by name')).rows,
    }));
    res.json(data);
  });
  route('post', '/projects', async (req, res) => {
    const input = projectSchema.parse(req.body);
    const project = await scoped(req, async (c) => {
      const id = (
        await one(c, 'select create_project_for_member($1,$2,$3,$4,$5) as id', [
          input.organisation_id,
          input.title,
          input.sector,
          input.countries,
          input.description,
        ])
      ).id;
      const p = await one(c, 'select * from projects where id=$1', [id]);
      await audit(
        c,
        input.organisation_id,
        String(id),
        (req as Authed).user.id,
        'project.created',
        'projects',
        String(id),
        null,
        p,
      );
      return p;
    });
    res.status(201).json(project);
  });
  route('get', '/projects/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await permission(req, 'read', id);
    const result = await scoped(req, async (c) => {
      const output: Record<string, unknown> = {
        project: await one(c, 'select * from projects where id=$1', [id]),
      };
      for (const table of [
        'datasets',
        'dataset_versions',
        'data_import_jobs',
        'data_quality_results',
        'data_dictionary_entries',
        'evidence_records',
        'recommendations',
        'approvals',
        'operational_alerts',
        'action_items',
        'milestones',
        'reports',
        'problem_briefs',
        'requirements_documents',
        'stakeholders',
        'risk_assessments',
        'ai_incidents',
        'experiments',
        'experiment_runs',
        'experiment_results',
        'models',
        'model_versions',
        'intervention_options',
        'optimisation_scenarios',
        'learning_modules',
        'learning_progress',
        'facilities',
        'medicine_products',
        'deliveries',
        'audit_logs',
        'notifications',
        'analytical_runs',
      ])
        output[table] = (
          await c.query(
            `select * from ${table} where project_id=$1 order by created_at desc limit 500`,
            [id],
          )
        ).rows;
      output.my_role = (await one(c, 'select project_role($1) as role', [id])).role;
      output.members = (
        await c.query(
          'select pm.id,pm.user_id,pm.role,u.full_name,u.email from project_memberships pm join user_profiles u on u.id=pm.user_id where pm.project_id=$1',
          [id],
        )
      ).rows;
      return output;
    });
    res.json(result);
  });
  route('get', '/projects/:id/stock', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await permission(req, 'read', id);
    res.json(await scoped(req, (c) => stockAnalysis(c, id, false)));
  });
  route('get', '/projects/:id/forecast', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await permission(req, 'read', id);
    res.json(await scoped(req, (c) => forecastAnalysis(c, id, false)));
  });
  route('get', '/projects/:id/finance', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await permission(req, 'read', id);
    res.json(await scoped(req, (c) => financeAnalysis(c, id, false)));
  });
  route('post', '/projects/:id/analysis', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await permission(req, 'data', id);
    const kind = z.enum(['inventory', 'forecast', 'finance']).parse(req.body.kind);
    const result = await scoped(req, async (c) =>
      kind === 'inventory'
        ? stockAnalysis(c, id)
        : kind === 'forecast'
          ? forecastAnalysis(c, id)
          : financeAnalysis(c, id),
    );
    res.json(result);
  });
  route('patch', '/projects/:id/settings', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await permission(req, 'manage', id);
    const settings = z
      .object({ stock_threshold_days: z.number().int().min(7).max(90), as_of: date })
      .parse(req.body);
    res.json(
      await scoped(req, async (c) => {
        const old = await one(c, 'select * from projects where id=$1', [id]);
        const p = await one(c, 'update projects set settings=$1 where id=$2 returning *', [
          json(settings),
          id,
        ]);
        await audit(
          c,
          String(p.organisation_id),
          id,
          (req as Authed).user.id,
          'project.settings_updated',
          'projects',
          id,
          old.settings,
          p,
        );
        return p;
      }),
    );
  });
  route('patch', '/settings/profile', async (req, res) => {
    const input = z
      .object({
        full_name: text.max(120),
        preferences: z.object({ in_app_alerts: z.boolean(), email_digest: z.literal(false) }),
      })
      .parse(req.body);
    res.json(
      await scoped(req, async (c) => {
        const u = await one(
          c,
          'update user_profiles set full_name=$1,preferences=$2 where id=app_uid() returning id,full_name,preferences',
          [input.full_name, json(input.preferences)],
        );
        for (const p of (await c.query('select * from projects')).rows)
          await audit(
            c,
            String(p.organisation_id),
            String(p.id),
            (req as Authed).user.id,
            'profile.preferences_updated',
            'user_profiles',
            String(u.id),
            null,
            { preferences: input.preferences },
          );
        return u;
      }),
    );
  });
  route('get', '/settings/connections', async (req, res) => {
    res.json({
      database: 'Persistent PostgreSQL-compatible storage',
      llm_configured: !!process.env.LLM_API_KEY,
      llm_external_enabled: process.env.LLM_EXTERNAL_ENABLED === 'true',
      email_configured: false,
      retention_job_configured: false,
    });
  });
  route('get', '/search', async (req, res) => {
    const q = z.string().min(1).max(100).parse(req.query.q);
    const pattern = '%' + q.replace(/[%_]/g, '\\$&') + '%';
    res.json(
      await scoped(req, async (c) => {
        const out: Record<string, unknown>[] = [];
        for (const table of [
          'projects',
          'datasets',
          'reports',
          'experiments',
          'operational_alerts',
          'learning_modules',
        ]) {
          const field = table === 'operational_alerts' || table === 'reports' ? 'title' : 'name';
          const sql =
            table === 'projects'
              ? 'select id,title as name,organisation_id,id as project_id from projects where title ilike $1 limit 5'
              : `select id,${field} as name,project_id from ${table} where ${field} ilike $1 limit 5`;
          const result = await c.query(sql, [pattern]);
          out.push(...result.rows.map((r) => ({ ...r, type: table })));
        }
        return out;
      }),
    );
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8 },
  });
  app.post(
    '/api/projects/:id/imports/preview',
    auth,
    upload.single('file'),
    asyncRoute(async (req, res) => {
      const id = uuid.parse(req.params.id);
      await permission(req, 'data', id);
      const kind = z
        .enum([
          'inventory',
          'budgets',
          'funding_releases',
          'procurement_events',
          'expenditure_records',
        ])
        .parse(req.body.kind);
      if (!req.file) throw httpError(400, 'Choose a CSV or XLSX file');
      const name = req.file.originalname;
      let records: RawRow[];
      if (/\.csv$/i.test(name)) {
        const parsed = Papa.parse<RawRow>(req.file.buffer.toString('utf8'), {
          header: true,
          skipEmptyLines: 'greedy',
          transformHeader: (h) => h.trim(),
        });
        if (parsed.errors.some((e) => e.type === 'Quotes'))
          throw httpError(400, 'CSV contains malformed quoting: ' + parsed.errors[0].message);
        records = parsed.data;
      } else if (/\.xlsx$/i.test(name)) {
        if (req.file.buffer.length > 2 * 1024 * 1024)
          throw httpError(400, 'XLSX files are limited to 2 MB');
        checkZipSize(req.file.buffer);
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(req.file.buffer as unknown as ExcelJS.Buffer);
        const sheet = wb.worksheets[0];
        if (!sheet || sheet.rowCount > 5001 || sheet.columnCount > 80)
          throw httpError(400, 'Use one worksheet with at most 5,000 rows and 80 columns');
        const headers: string[] = [];
        sheet.getRow(1).eachCell((cell, i) => {
          headers[i - 1] = cell.text.trim();
        });
        records = [];
        sheet.eachRow((row, i) => {
          if (i === 1) return;
          const record: RawRow = {};
          row.eachCell({ includeEmpty: true }, (cell, col) => {
            if (headers[col - 1])
              record[headers[col - 1]] =
                cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.value;
          });
          records.push(record);
        });
      } else throw httpError(400, 'Only .csv and .xlsx files are accepted');
      if (!records.length || records.length > 5000 || Object.keys(records[0]).length > 80)
        throw httpError(400, 'Provide 1–5,000 records and at most 80 columns');
      const columns = Object.keys(records[0]);
      if (new Set(columns).size !== columns.length)
        throw httpError(400, 'Duplicate source column headings');
      const result = await scoped(req, async (c) => {
        const { org, actor } = await context(c, id);
        return insert(c, 'data_import_jobs', {
          organisation_id: org,
          project_id: id,
          created_by: actor,
          filename: name.slice(0, 250),
          kind,
          status: 'Preview',
          mapping: Object.fromEntries(columns.map((h) => [h, h])),
          preview_rows: records,
          columns,
        });
      });
      res.status(201).json(result);
    }),
  );
  route('post', '/imports/:id/commit', async (req, res) => {
    const jobId = uuid.parse(req.params.id);
    const mapping = mappingSchema.parse(req.body.mapping);
    const result = await scoped(req, async (c) => {
      const job = await one(c, "select * from data_import_jobs where id=$1 and status='Preview'", [
        jobId,
      ]);
      const id = String(job.project_id),
        kind = String(job.kind),
        { org, actor } = await context(c, id);
      const fields = requiredFields[kind];
      const mapped = Object.values(mapping);
      if (fields.some((f) => !mapped.includes(f)) || new Set(mapped).size !== mapped.length)
        throw httpError(400, 'Map every required field to a distinct source column');
      const raw = job.preview_rows as RawRow[];
      const f = (await c.query('select * from facilities where project_id=$1', [id])).rows,
        p = (await c.query('select * from medicine_products where project_id=$1', [id])).rows,
        bv = await latestVersion(c, id, 'budgets'),
        b = bv
          ? (
              await c.query('select * from budgets where project_id=$1 and version_id=$2', [
                id,
                bv.id,
              ])
            ).rows
          : [];
      const validation = validateRows(kind, raw, mapping, {
        facilities: new Map(
          f.map((x) => [String(x.external_id), { id: String(x.id), country: String(x.country) }]),
        ),
        products: new Map(
          p.map((x) => [String(x.external_id), { id: String(x.id), unit: String(x.unit) }]),
        ),
        budgets: new Map(
          b.map((x) => [
            String(x.external_id),
            {
              id: String(x.id),
              currency: String(x.currency),
              programme_code: String(x.programme_code),
            },
          ]),
        ),
      });
      const { accepted, rejections } = validation;
      if (!accepted.length) {
        const report = qualityReport(kind, raw, 0, rejections, AS_OF);
        const updated = await one(
          c,
          "update data_import_jobs set status='Rejected',mapping=$1,accepted_count=0,rejected_count=$2,rejections=$3 where id=$4 returning *",
          [json(mapping), rejections.length, json(rejections), jobId],
        );
        await audit(c, org, id, actor, 'dataset.rejected', 'data_import_jobs', jobId, null, {
          accepted: 0,
          rejected: rejections.length,
        });
        return { job: updated, version: null, quality: report };
      }
      const datasetName = z
        .string()
        .min(1)
        .max(160)
        .parse(req.body.name || String(job.filename));
      let d = (
        await c.query('select * from datasets where project_id=$1 and kind=$2 and name=$3', [
          id,
          kind,
          datasetName,
        ])
      ).rows[0];
      if (!d)
        d = await insert(c, 'datasets', {
          organisation_id: org,
          project_id: id,
          created_by: actor,
          name: datasetName,
          kind,
          description: 'User import: ' + job.filename,
          source: job.filename,
          owner: (req as Authed).user.full_name,
          sensitivity: 'Internal',
          quality_status: rejections.length ? 'Issues found' : 'Validated',
          lineage: 'Upload → mapping → validation → immutable version',
          schema_version: '1.0',
        });
      const versionNumber = Number(
        (
          await one(
            c,
            'select coalesce(max(version),0)+1 as n from dataset_versions where dataset_id=$1',
            [d.id],
          )
        ).n,
      );
      const dates = accepted
        .map((r) => String(r.data.reporting_date || r.data.transaction_date || ''))
        .filter(Boolean)
        .sort();
      const v = await insert(c, 'dataset_versions', {
        organisation_id: org,
        project_id: id,
        created_by: actor,
        dataset_id: d.id,
        version: versionNumber,
        row_count: accepted.length,
        checksum: checksum(accepted),
        period_start: dates[0] || null,
        period_end: dates.at(-1) || null,
        notes: `Import job ${jobId}; ${rejections.length} rejected rows retained`,
      });
      for (const { row, data: r } of accepted) {
        const common = {
          organisation_id: org,
          project_id: id,
          created_by: actor,
          version_id: v.id,
          source_row: row,
        };
        if (kind === 'inventory') {
          await insert(c, 'inventory_records', {
            ...common,
            facility_id: r.facility_uuid,
            product_id: r.product_uuid,
            ...Object.fromEntries(
              [
                'reporting_date',
                'opening_stock',
                'quantity_received',
                'quantity_dispensed',
                'adjustments',
                'closing_stock',
                'usable_stock',
                'reserved_stock',
                'expired_stock',
                'stockout_days',
                'expiry_date',
                'batch_identifier',
                'minimum_stock',
                'maximum_stock',
                'country',
                'supplier',
              ].map((k) => [k, r[k] ?? null]),
            ),
            quality_status: 'Validated import',
          });
          const end = new Date(String(r.reporting_date) + 'T12:00:00Z');
          end.setUTCDate(end.getUTCDate() - 6);
          await insert(c, 'consumption_records', {
            ...common,
            facility_id: r.facility_uuid,
            product_id: r.product_uuid,
            period_start: end.toISOString().slice(0, 10),
            period_end: r.reporting_date,
            quantity: r.quantity_dispensed,
            unit: r.unit,
          });
        } else {
          const base = {
            ...common,
            ...Object.fromEntries(
              Object.entries(r).filter(
                ([k]) =>
                  ![
                    'amount',
                    'amount_cents',
                    'facility_uuid',
                    'product_uuid',
                    ...(kind === 'budgets' ? ['budget_id'] : []),
                  ].includes(k),
              ),
            ),
            amount_cents: r.amount_cents,
            ...(kind !== 'budgets' ? { budget_id: r.budget_id || null } : {}),
          };
          await insert(c, kind, base);
        }
      }
      const report = qualityReport(
        kind,
        raw,
        accepted.length,
        rejections,
        String(v.period_end || ''),
      );
      await insert(c, 'data_quality_results', {
        organisation_id: org,
        project_id: id,
        created_by: actor,
        dataset_id: d.id,
        version_id: v.id,
        metrics: report.metrics,
        issues: report.issues,
        limitations: report.limitations,
      });
      const updated = await one(
        c,
        "update data_import_jobs set status='Completed',dataset_id=$1,version_id=$2,mapping=$3,accepted_count=$4,rejected_count=$5,rejections=$6 where id=$7 returning *",
        [d.id, v.id, json(mapping), accepted.length, rejections.length, json(rejections), jobId],
      );
      await audit(c, org, id, actor, 'dataset.imported', 'datasets', String(d.id), null, {
        version_id: v.id,
        accepted: accepted.length,
        rejected: rejections.length,
      });
      // Uploaded internal records replace the latest analytical snapshot only after explicit recalculation.
      await c.query('update datasets set quality_status=$1,updated_at=now() where id=$2', [
        rejections.length ? 'Issues found' : 'Validated',
        d.id,
      ]);
      return { job: updated, version: v, quality: report };
    });
    res.status(201).json(result);
  });
  route('get', '/imports/:id/rejections', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const job = await scoped(req, (c) =>
      one(c, 'select * from data_import_jobs where id=$1', [id]),
    );
    const rejected = job.rejections as {
      row: number;
      field: string;
      reason: string;
      record: RawRow;
    }[];
    const fields = [...new Set(rejected.flatMap((r) => Object.keys(r.record)))];
    res.setHeader('Content-Disposition', 'attachment; filename="rejection-report.csv"');
    res.type('text/csv').send(
      Papa.unparse(
        rejected.map((r) => ({
          source_row: r.row,
          field: r.field,
          reason: r.reason,
          ...Object.fromEntries(fields.map((f) => [f, csvSafe(r.record[f])])),
        })),
      ),
    );
  });
  route('post', '/projects/:id/recommendations', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await permission(req, 'manage', id);
    const input = z
      .object({
        title: text.max(160),
        problem: text,
        action: text,
        benefit: text,
        evidence_id: uuid,
      })
      .parse(req.body);
    res.status(201).json(
      await scoped(req, async (c) => {
        await one(c, 'select id from evidence_records where id=$1 and project_id=$2', [
          input.evidence_id,
          id,
        ]);
        return createRecommendation(
          c,
          id,
          input.title,
          input.problem,
          { description: input.action },
          input.benefit,
          input.evidence_id,
          ['User-entered proposal; verify evidence before approval.'],
        );
      }),
    );
  });
  route('post', '/recommendations/:id/transition', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const input = z
      .object({
        state: z.enum([
          'Draft',
          'Under Review',
          'Approved',
          'Rejected',
          'Deferred',
          'Implemented',
          'Outcome Reviewed',
        ]),
        reason: text.max(3000),
        final_action: z.record(z.string(), z.unknown()).optional(),
        note: z.string().max(3000).optional(),
      })
      .parse(req.body);
    res.json(
      await scoped(req, async (c) => {
        const r = await one(c, 'select * from recommendations where id=$1 for update', [id]);
        const { org, actor } = await context(c, String(r.project_id));
        transition(r.state as RecommendationState, input.state);
        const approval = ['Approved', 'Rejected', 'Deferred'].includes(input.state);
        const role = await one(c, 'select project_role($1) as role', [r.project_id]);
        if (approval || ['Implemented', 'Outcome Reviewed'].includes(input.state)) {
          if (!can(role.role as Role, approval ? 'approve' : 'operate'))
            throw httpError(403, 'This transition requires an authorised reviewer or operator');
        } else if (!can(role.role as Role, 'manage'))
          throw httpError(403, 'Programme management permission required');
        if ((approval || input.state === 'Implemented') && String(r.owner_id) === actor)
          throw httpError(403, 'The proposal owner cannot approve or implement their own proposal');
        if (approval) {
          const es = (
            await c.query(
              'select e.* from evidence_records e join recommendation_evidence re on re.evidence_id=e.id where re.recommendation_id=$1',
              [id],
            )
          ).rows;
          if (!es.length) throw httpError(400, 'Evidence is required before review');
          await insert(c, 'approvals', {
            organisation_id: org,
            project_id: r.project_id,
            created_by: actor,
            recommendation_id: id,
            decision: input.state,
            reason: input.reason,
            reviewer_id: actor,
            original_action: r.proposed_action,
            final_action: input.final_action || r.proposed_action,
            evidence_snapshot: es,
            override:
              !!input.final_action &&
              JSON.stringify(input.final_action) !== JSON.stringify(r.proposed_action),
          });
        }
        const updated = await one(
          c,
          'update recommendations set state=$1,review_date=now(),implementation_note=coalesce($2,implementation_note),outcome=coalesce($3,outcome) where id=$4 returning *',
          [
            input.state,
            input.state === 'Implemented' ? input.note : null,
            input.state === 'Outcome Reviewed' ? input.note : null,
            id,
          ],
        );
        await audit(
          c,
          org,
          String(r.project_id),
          actor,
          'recommendation.' + input.state,
          'recommendations',
          id,
          r,
          updated,
          input.reason,
        );
        return updated;
      }),
    );
  });
  route('post', '/projects/:id/scenarios', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await permission(req, 'manage', id);
    const input = z
      .object({
        name: text.max(160),
        budget: z.number().min(0).max(100000000),
        currency: z.literal('USD'),
        equity_minimum: z.number().int().min(0).max(16),
        max_months: z.number().int().min(1).max(24),
        required_geographies: z.array(z.string().max(100)).max(10),
        required_options: z.array(uuid).max(16).default([]),
      })
      .parse(req.body);
    res.status(201).json(
      await scoped(req, async (c) => {
        const { org, actor } = await context(c, id);
        const options = (
          await c.query('select * from intervention_options where project_id=$1', [id])
        ).rows.map((o) => ({
          ...o,
          cost_cents: Number(o.cost_cents),
          expected_outcome: Number(o.expected_outcome),
          capacity: Number(o.capacity),
          implementation_months: Number(o.implementation_months),
        }));
        const constraints: Constraints = {
          required_geographies: input.required_geographies,
          equity_minimum: input.equity_minimum,
          max_months: input.max_months,
          required_options: input.required_options,
        };
        const result = optimise(
          options as never,
          Math.round(input.budget * 100),
          input.currency,
          constraints,
        );
        const s = await insert(c, 'optimisation_scenarios', {
          organisation_id: org,
          project_id: id,
          created_by: actor,
          name: input.name,
          budget_cents: Math.round(input.budget * 100),
          currency: input.currency,
          constraints,
          option_snapshot: options,
          result,
        });
        const e = await saveEvidence(
          c,
          id,
          'Which portfolio satisfies ' + input.name + '?',
          result.method,
          { ...result, options, constraints },
          ['intervention_options'],
          input.name,
          result.assumptions,
          ['Synthetic assumed reach. Human policy review required.'],
        );
        const r = await createRecommendation(
          c,
          id,
          'Review portfolio: ' + input.name,
          'Budget-constrained intervention prioritisation',
          { kind: 'allocation', scenario_id: s.id, selected: result.selected },
          'Assumed reach only; not a verified health benefit.',
          String(e.id),
          result.assumptions,
        );
        const updated = await one(
          c,
          "update optimisation_scenarios set status='Computed',recommendation_id=$1 where id=$2 returning *",
          [r.id, s.id],
        );
        await audit(
          c,
          org,
          id,
          actor,
          'scenario.created',
          'optimisation_scenarios',
          String(s.id),
          null,
          updated,
        );
        return updated;
      }),
    );
  });
  route('post', '/scenarios/:id/run', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const s = await scoped(req, (c) =>
      one(c, 'select project_id from optimisation_scenarios where id=$1', [id]),
    );
    await permission(req, 'data', String(s.project_id));
    res.json(await scoped(req, (c) => saveScenario(c, String(s.project_id), id)));
  });
  route('post', '/projects/:id/experiments', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await permission(req, 'data', id);
    const input = z
      .object({
        name: text.max(160),
        objective: text,
        hypothesis: text,
        method: z.enum(['forecast-comparison', 'threshold-comparison']),
        window: z.number().int().min(2).max(8).default(4),
      })
      .parse(req.body);
    res.status(201).json(
      await scoped(req, async (c) => {
        const { org, actor } = await context(c, id);
        const version = await latestVersion(c, id, 'inventory');
        return insert(c, 'experiments', {
          organisation_id: org,
          project_id: id,
          created_by: actor,
          name: input.name,
          objective: input.objective,
          hypothesis: input.hypothesis,
          method: input.method,
          configuration: { window: input.window, alpha: 0.3 },
          dataset_version_id: version?.id || null,
          status: 'Ready',
          model_version: 'forecast-1.0',
          evaluation_criteria: 'Held-out MAE, WAPE and bias',
          expected_outcome: 'Reproducible comparison; no presumed winner',
          limitations: 'Synthetic consumption may be censored by stockouts.',
        });
      }),
    );
  });
  route('post', '/experiments/:id/run', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const e = await scoped(req, (c) => one(c, 'select * from experiments where id=$1', [id]));
    await permission(req, 'data', String(e.project_id));
    if (!['forecast-comparison', 'threshold-comparison'].includes(String(e.method)))
      throw httpError(
        400,
        'This experiment needs an external model. It remains an unexecuted illustration.',
      );
    res.json(
      await scoped(req, async (c) => {
        const { org, actor } = await context(c, String(e.project_id));
        await c.query("update experiments set status='Running' where id=$1", [id]);
        const start = performance.now();
        try {
          const result =
            e.method === 'forecast-comparison'
              ? await forecastAnalysis(c, String(e.project_id), false)
              : await stockAnalysis(c, String(e.project_id), false);
          if (!result) throw new Error('Import inventory data before execution');
          const duration = Math.round(performance.now() - start);
          const run = await insert(c, 'experiment_runs', {
            organisation_id: org,
            project_id: e.project_id,
            created_by: actor,
            experiment_id: id,
            status: 'Completed',
            configuration: e.configuration,
            result,
            duration_ms: duration,
            cost: null,
            failure_cases: ['No external LLM cost or latency measured.'],
          });
          if ('test' in result)
            for (const m of result.test as Record<string, unknown>[])
              await insert(c, 'experiment_results', {
                organisation_id: org,
                project_id: e.project_id,
                created_by: actor,
                run_id: run.id,
                test_case: String(m.method),
                input: { train: result.train_period, test: result.test_period },
                output: m,
                metrics: m,
                passed: true,
              });
          await c.query(
            "update experiments set status='Completed',actual_outcome='Executed synchronously; measured wall-clock duration recorded in the run.',conclusions='Inspect held-out results and limitations before continuing.',decision='Review before continuing' where id=$1",
            [id],
          );
          await audit(
            c,
            org,
            String(e.project_id),
            actor,
            'experiment.executed',
            'experiments',
            id,
            null,
            { run_id: run.id, duration_ms: duration },
          );
          return run;
        } catch (error) {
          await c.query("update experiments set status='Failed' where id=$1", [id]);
          throw error;
        }
      }),
    );
  });
  route('post', '/projects/:id/assistant', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await permission(req, 'read', id);
    const { question } = z.object({ question: text.max(1000) }).parse(req.body);
    const result = await scoped(req, (c) => explain(c, id, question));
    res.json(result);
  });
  route('post', '/projects/:id/reports', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await permission(req, 'manage', id);
    const input = z
      .object({
        title: text.max(160),
        kind: text.max(80),
        evidence_ids: z.array(uuid).min(1).max(20),
      })
      .parse(req.body);
    res.status(201).json(
      await scoped(req, async (c) => {
        const { org, actor } = await context(c, id);
        const evidence = (
          await c.query(
            'select * from evidence_records where project_id=$1 and id=any($2::uuid[])',
            [id, input.evidence_ids],
          )
        ).rows;
        if (evidence.length !== new Set(input.evidence_ids).size)
          throw httpError(400, 'One or more evidence references are unavailable');
        const content = reportMarkdown(input.title, input.kind, evidence, id);
        const r = await insert(c, 'reports', {
          organisation_id: org,
          project_id: id,
          created_by: actor,
          title: input.title,
          kind: input.kind,
          content,
          evidence_ids: input.evidence_ids,
          assumptions: [
            'Synthetic demonstration unless a verified private source is explicitly identified.',
          ],
        });
        await audit(c, org, id, actor, 'report.generated', 'reports', String(r.id), null, {
          version: 1,
          evidence_ids: input.evidence_ids,
        });
        return r;
      }),
    );
  });
  route('get', '/reports/:id/export', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const r = await scoped(req, (c) => one(c, 'select * from reports where id=$1', [id]));
    res
      .type('text/markdown')
      .setHeader('Content-Disposition', `attachment; filename="afriscope-report-${id}.md"`);
    res.send(r.content);
  });
  route('post', '/learning/:id/submit', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const answers = z.record(z.string(), z.number().int().min(0).max(5)).parse(req.body.answers);
    res.json(
      await scoped(req, async (c) => {
        const m = await one(c, 'select * from learning_modules where id=$1 and published=true', [
          id,
        ]);
        const quiz = (m.content as { quiz: { answer: number }[] }).quiz || [];
        if (!quiz.length) throw httpError(400, 'No assessment is configured');
        const score = Math.round(
          (quiz.filter((q, i) => answers[i] === q.answer).length / quiz.length) * 100,
        );
        const existing = (
          await c.query(
            'select id from learning_progress where module_id=$1 and user_id=app_uid()',
            [id],
          )
        ).rows[0];
        const data = {
          status: score >= 80 ? 'Completed' : 'Needs review',
          answers,
          score,
          completed_at: score >= 80 ? new Date().toISOString() : null,
        };
        const result = existing
          ? await one(
              c,
              'update learning_progress set status=$1,answers=$2,score=$3,completed_at=$4 where id=$5 returning *',
              [data.status, json(answers), score, data.completed_at, existing.id],
            )
          : await insert(c, 'learning_progress', {
              organisation_id: m.organisation_id,
              project_id: m.project_id,
              created_by: (req as Authed).user.id,
              user_id: (req as Authed).user.id,
              module_id: id,
              ...data,
            });
        await audit(
          c,
          String(m.organisation_id),
          String(m.project_id),
          (req as Authed).user.id,
          'learning.assessed',
          'learning_progress',
          String(result.id),
          null,
          { score },
        );
        return result;
      }),
    );
  });
  // Allowlisted CRUD is schema-validated; table names and writable columns never come from SQL input.
  const writable = [
    'stakeholders',
    'problem_briefs',
    'requirements_documents',
    'action_items',
    'milestones',
    'risk_assessments',
    'ai_incidents',
    'intervention_options',
    'models',
    'model_versions',
    'learning_modules',
    'operational_alerts',
  ];
  for (const table of writable) {
    const metadata = tables[table as keyof typeof tables] as {
      group: string;
      fields: Record<string, string>;
    };
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [name, definition] of Object.entries(metadata.fields)) {
      if (['unique', 'check'].includes(name)) continue;
      let field: z.ZodTypeAny =
        definition.startsWith('integer') ||
        definition.startsWith('bigint') ||
        definition.startsWith('numeric')
          ? z
              .number()
              .finite()
              .min(name.includes('cost') || name.includes('amount') ? 0 : -100000000)
              .max(10000000000)
          : definition.startsWith('boolean')
            ? z.boolean()
            : definition.startsWith('jsonb')
              ? z.unknown()
              : z.string().max(10000);
      if (definition.startsWith('integer')) field = (field as z.ZodNumber).int();
      if (name.endsWith('_id') && definition.includes('references user_profiles'))
        field = uuid.nullable();
      if (name === 'due_date' || name === 'review_date') field = date.nullable();
      if (!definition.includes('not null') && !definition.includes('default'))
        field = field.optional().nullable();
      shape[name] = field;
    }
    const schema = z.object(shape).strict();
    route('post', '/projects/:id/records/:table', async (req, res) => {
      if (req.params.table !== table) throw httpError(404, 'Unknown resource');
      const id = uuid.parse(req.params.id);
      await permission(req, metadata.group, id);
      const parsed = schema.parse(req.body);
      if (
        table === 'intervention_options' &&
        Number(parsed.expected_outcome) > Number(parsed.capacity)
      )
        throw httpError(400, 'Expected outcome cannot exceed delivery capacity');
      res.status(201).json(
        await scoped(req, async (c) => {
          const { org, actor } = await context(c, id);
          const r = await insert(c, table, {
            organisation_id: org,
            project_id: id,
            created_by: actor,
            ...parsed,
          });
          await audit(c, org, id, actor, table + '.created', table, String(r.id), null, r);
          return r;
        }),
      );
    });
    route('patch', '/records/:table/:id', async (req, res) => {
      if (req.params.table !== table) throw httpError(404, 'Unknown resource');
      const id = uuid.parse(req.params.id);
      const parsed = schema.partial().parse(req.body);
      if (!Object.keys(parsed).length) throw httpError(400, 'No changes supplied');
      const existing = await scoped(req, (c) => one(c, `select * from ${table} where id=$1`, [id]));
      await permission(req, metadata.group, String(existing.project_id));
      if (table === 'operational_alerts') {
        const status = parsed.status;
        if (
          status &&
          !['Open', 'Acknowledged', 'Investigating', 'Resolved', 'Escalated'].includes(
            String(status),
          )
        )
          throw httpError(400, 'Invalid alert status');
        if (status === 'Resolved' && !parsed.resolved_note)
          throw httpError(400, 'Describe how the alert was resolved');
      }
      res.json(
        await scoped(req, async (c) => {
          const keys = Object.keys(parsed);
          const r = await one(
            c,
            `update ${table} set ${keys.map((k, i) => k + '=$' + (i + 1)).join(',')},updated_at=now() where id=$${keys.length + 1} returning *`,
            [
              ...Object.values(parsed).map((v) =>
                v && typeof v === 'object' ? csvSafe(JSON.stringify(v)) : v,
              ),
              id,
            ],
          );
          await audit(
            c,
            String(existing.organisation_id),
            String(existing.project_id),
            (req as Authed).user.id,
            table + '.updated',
            table,
            id,
            existing,
            r,
            typeof parsed.reason === 'string' ? parsed.reason : '',
          );
          return r;
        }),
      );
    });
  }
  route('post', '/projects/:id/invitations', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await permission(req, 'admin', id);
    const input = z
      .object({ email: z.string().email().max(254), role: z.enum(ROLES) })
      .parse(req.body);
    const token = randomBytes(32).toString('base64url');
    const invitation = await db.admin(async (c) => {
      const p = await one(c, 'select organisation_id from projects where id=$1', [id]);
      return insert(c, 'invitations', {
        organisation_id: p.organisation_id,
        email: input.email.toLowerCase(),
        role: input.role,
        token_hash: hash(token),
        expires_at: new Date(Date.now() + 72 * 3600000).toISOString(),
      });
    });
    await scoped(req, (c) =>
      audit(
        c,
        String(invitation.organisation_id),
        id,
        (req as Authed).user.id,
        'invitation.created',
        'invitations',
        String(invitation.id),
        null,
        { email: input.email, role: input.role },
      ),
    );
    res.status(201).json({
      id: invitation.id,
      path: '/accept-invite?token=' + token,
      message: 'Deliver this single-use invitation securely. Email delivery is not configured.',
    });
  });
  route(
    'post',
    '/auth/accept-invite',
    async (req, res) => {
      const input = z
        .object({
          token: z.string().min(20).max(100),
          full_name: text.max(120),
          password: z.string().min(12).max(256),
        })
        .parse(req.body);
      const user = await db.admin(async (c) => {
        const i = (
          await c.query(
            'select * from invitations where token_hash=$1 and accepted_at is null and expires_at>now() for update',
            [hash(input.token)],
          )
        ).rows[0];
        if (!i) throw httpError(400, 'Invitation is invalid or expired');
        if ((await c.query('select id from user_profiles where email=$1', [i.email])).rows.length)
          throw httpError(400, 'An account already exists for this invitation');
        const salt = randomBytes(16).toString('hex');
        const u = await insert(c, 'user_profiles', {
          email: i.email,
          full_name: input.full_name,
          password_hash: `scrypt:${salt}:${scryptSync(input.password, salt, 64).toString('hex')}`,
        });
        await insert(c, 'organisation_memberships', {
          organisation_id: i.organisation_id,
          user_id: u.id,
          role: i.role,
        });
        for (const p of (
          await c.query('select id from projects where organisation_id=$1', [i.organisation_id])
        ).rows)
          await insert(c, 'project_memberships', { project_id: p.id, user_id: u.id, role: i.role });
        await c.query('update invitations set accepted_at=now() where id=$1', [i.id]);
        return u;
      });
      await session(req, res, String(user.id));
      res.status(201).json({ ok: true });
    },
    false,
  );
  route('patch', '/memberships/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const role = z.enum(ROLES).parse(req.body.role);
    await db.admin(async (c) => {
      const m = (await c.query('select * from project_memberships where id=$1', [id])).rows[0];
      if (!m) throw httpError(404, 'Membership not found');
      const org = (await one(c, 'select organisation_id from projects where id=$1', [m.project_id]))
        .organisation_id;
      const actor = (
        await c.query(
          'select role from organisation_memberships where organisation_id=$1 and user_id=$2',
          [org, (req as Authed).user.id],
        )
      ).rows[0];
      if (!actor || !can(actor.role as Role, 'admin'))
        throw httpError(403, 'Organisation administrator required');
      if (role === 'platform_admin')
        throw httpError(400, 'Platform administration is provisioned separately');
      await c.query('update project_memberships set role=$1 where id=$2', [role, id]);
      await audit(
        c,
        String(org),
        String(m.project_id),
        (req as Authed).user.id,
        'membership.role_updated',
        'project_memberships',
        id,
        m,
        { ...m, role },
      );
    });
    res.json({ ok: true });
  });
  route('post', '/demo/reset', async (req, res) => {
    if (req.body.confirmation !== 'RESET')
      throw httpError(400, 'Type RESET to confirm demonstration-only reset');
    const checked = await scoped(req, async (c) => {
      const o = await one(c, 'select is_demo from organisations where id=$1', [DEMO_ORG]);
      const m = await one(
        c,
        'select role from organisation_memberships where organisation_id=$1 and user_id=app_uid()',
        [DEMO_ORG],
      );
      return o.is_demo && can(m.role as Role, 'admin');
    });
    if (!checked || process.env.DEMO_ENABLED === 'false')
      throw httpError(
        403,
        'Only a demonstration organisation administrator may reset synthetic data',
      );
    await seedDemo(db, true);
    await db.admin((c) =>
      c.query(
        'delete from auth_sessions where user_id in(select user_id from organisation_memberships where organisation_id=$1)',
        [DEMO_ORG],
      ),
    );
    res.clearCookie(cookieName, { path: '/' });
    res.json({ ok: true, message: 'Synthetic demo reset. Sign in again.' });
  });
  route('get', '/projects/:id/export/:table', async (req, res) => {
    const id = uuid.parse(req.params.id),
      table = z
        .enum([
          'inventory_records',
          'consumption_records',
          'budgets',
          'funding_releases',
          'procurement_events',
          'expenditure_records',
          'stakeholders',
          'evidence_records',
          'audit_logs',
          'data_quality_results',
          'intervention_options',
        ])
        .parse(req.params.table);
    await permission(req, 'read', id);
    const result = await scoped(req, (c) =>
      c.query(`select * from ${table} where project_id=$1 order by created_at limit 5000`, [id]),
    );
    if (table === 'audit_logs')
      await scoped(req, async (c) =>
        audit(
          c,
          String(
            result.rows[0]?.organisation_id ||
              (await one(c, 'select organisation_id from projects where id=$1', [id]))
                .organisation_id,
          ),
          id,
          (req as Authed).user.id,
          'audit.exported',
          'audit_logs',
          id,
        ),
      );
    res.type('text/csv').setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
    res.send(
      Papa.unparse(
        result.rows.map((r) =>
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [
              k,
              typeof v === 'string'
                ? csvSafe(v)
                : v && typeof v === 'object'
                  ? csvSafe(JSON.stringify(v))
                  : v,
            ]),
          ),
        ),
      ),
    );
  });
  app.use('/api', (_req, _res, next) => next(httpError(404, 'API endpoint not found')));
  app.use(
    (
      error: Error & { status?: number; code?: string },
      req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      const status =
        error instanceof z.ZodError
          ? 400
          : error.status ||
            (error.code === 'LIMIT_FILE_SIZE'
              ? 413
              : error.message.includes('Project creation requires')
                ? 403
                : ['23505', '23514', '23503'].includes(error.code || '')
                  ? 400
                  : 500);
      if (status >= 500)
        console.error(
          JSON.stringify({
            event: 'request_failed',
            path: req.path,
            code: error.code || 'INTERNAL',
            message: error.message.slice(0, 250),
          }),
        );
      res.status(status).json({
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')
            : status >= 500
              ? 'The operation could not be completed. No sensitive details are exposed.'
              : error.message,
      });
    },
  );
  return app;
}
function csvSafe(value: unknown) {
  const s = String(value ?? '');
  return /^[=+@\-\t\r]/.test(s) ? "'" + s : s;
}
function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}
function checkZipSize(buffer: Buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw httpError(400, 'Invalid XLSX archive');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16),
    total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50)
      throw httpError(400, 'Invalid XLSX directory');
    total += buffer.readUInt32LE(offset + 24);
    if (total > 20 * 1024 * 1024) throw httpError(413, 'XLSX expanded content exceeds 20 MB');
    const n = buffer.readUInt16LE(offset + 28),
      m = buffer.readUInt16LE(offset + 30),
      k = buffer.readUInt16LE(offset + 32);
    offset += 46 + n + m + k;
  }
}
