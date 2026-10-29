import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  openSync,
  writeFileSync,
  closeSync,
  unlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';
export type Params = unknown[];
export interface QueryResult {
  rows: Record<string, unknown>[];
  affectedRows?: number;
}
export interface Client {
  query(sql: string, params?: Params): Promise<QueryResult>;
}
export interface Database {
  admin<T>(fn: (tx: Client) => Promise<T>): Promise<T>;
  scoped<T>(user: string, fn: (tx: Client) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
const dateFields = new Set([
  'reporting_date',
  'expiry_date',
  'expected_date',
  'received_date',
  'due_date',
  'released_date',
  'started_date',
  'completed_date',
  'transaction_date',
  'period_start',
  'period_end',
  'review_date',
]);
const normalize = (result: QueryResult) => ({
  ...result,
  rows: result.rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        v instanceof Date && dateFields.has(k) ? v.toISOString().slice(0, 10) : v,
      ]),
    ),
  ),
});
export async function createDatabase(
  options: { path?: string; url?: string; migrate?: boolean } = {},
): Promise<Database> {
  let tx: <T>(fn: (c: Client) => Promise<T>) => Promise<T>, close: () => Promise<void>;
  if (options.url) {
    const pool = new pg.Pool({
      connectionString: options.url,
      max: 8,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
    });
    tx = async (fn) => {
      const c = await pool.connect();
      const client: Client = { query: async (sql, p = []) => normalize(await c.query(sql, p)) };
      try {
        await c.query('begin');
        const r = await fn(client);
        await c.query('commit');
        return r;
      } catch (e) {
        await c.query('rollback');
        throw e;
      } finally {
        c.release();
      }
    };
    close = () => pool.end();
  } else {
    const path = options.path || resolve(process.env.DATABASE_PATH || '.data/afriscope');
    if (path !== ':memory:') mkdirSync(path, { recursive: true });
    let lockPath: string | null = null;
    if (path !== ':memory:') {
      lockPath = path + '.lock';
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const fd = openSync(lockPath, 'wx');
          writeFileSync(fd, String(process.pid));
          closeSync(fd);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          const pid = Number(readFileSync(lockPath, 'utf8'));
          let alive = false;
          try {
            process.kill(pid, 0);
            alive = true;
          } catch {
            /* stale lock */
          }
          if (alive)
            throw new Error(
              'PGlite database is already open by another process. Use the running server API for reset, or stop it before CLI maintenance.',
            );
          unlinkSync(lockPath);
        }
      }
    }
    const db = new PGlite(path === ':memory:' ? undefined : path);
    try {
      await db.waitReady;
    } catch (error) {
      if (lockPath) unlinkSync(lockPath);
      throw error;
    }
    // PGlite is a single embedded connection. Queue complete transactions, including their commit,
    // so an arriving HTTP request cannot enter between a previous transaction's queries and release.
    let queue: Promise<void> = Promise.resolve();
    tx = <T>(fn: (c: Client) => Promise<T>) => {
      const result = queue.then(() =>
        db.transaction((t) =>
          fn({
            query: async (sql, p = []) => {
              if (p.length) return normalize((await t.query(sql, p)) as QueryResult);
              const results = await t.exec(sql);
              return normalize((results.at(-1) || { rows: [] }) as QueryResult);
            },
          }),
        ),
      );
      queue = result.then(
        () => {},
        () => {},
      );
      return result;
    };
    close = async () => {
      await db.close();
      if (lockPath) {
        try {
          unlinkSync(lockPath);
        } catch {
          /* already removed */
        }
      }
    };
  }
  const admin = <T>(fn: (c: Client) => Promise<T>) => tx(fn);
  const scoped = <T>(user: string, fn: (c: Client) => Promise<T>) =>
    tx(async (c) => {
      await c.query("select set_config('app.user_id',$1,true)", [user]);
      await c.query('set local role afri_app');
      return fn(c);
    });
  const db: Database = { admin, scoped, close };
  if (options.migrate !== false)
    await admin(async (c) => {
      await c.query(
        'create table if not exists schema_migrations(version text primary key,applied_at timestamptz not null default now())',
      );
      const applied = await c.query('select version from schema_migrations');
      for (const f of readdirSync(resolve('supabase/migrations'))
        .filter((f) => f.endsWith('.sql'))
        .sort()) {
        if (applied.rows.some((r) => r.version === f)) continue;
        for (const statement of (await import('./sql')).statements(
          readFileSync(resolve('supabase/migrations', f), 'utf8'),
        ))
          await c.query(statement);
        await c.query('insert into schema_migrations(version) values($1) on conflict do nothing', [
          f,
        ]);
      }
    });
  return db;
}
export async function one(c: Client, sql: string, p: Params = []) {
  const r = await c.query(sql, p);
  if (!r.rows[0])
    throw Object.assign(new Error('Record not found or access denied'), { status: 404 });
  return r.rows[0];
}
export async function audit(
  c: Client,
  org: string,
  project: string,
  actor: string,
  action: string,
  type: string,
  id: string,
  before: unknown = null,
  after: unknown = null,
  reason = '',
) {
  await c.query(
    'insert into audit_logs(organisation_id,project_id,created_by,actor_id,action,entity_type,entity_id,before_state,after_state,reason) values($1,$2,$3,$3,$4,$5,$6,$7,$8,$9)',
    [org, project, actor, action, type, id, JSON.stringify(before), JSON.stringify(after), reason],
  );
}
