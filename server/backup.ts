import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Database } from './db.js';
import { realtime } from './realtime.js';

export interface BackupMetadata {
  id: string;
  backup_type: 'manual' | 'automated_hourly' | 'automated_daily';
  status: 'Completed' | 'Failed' | 'In Progress';
  filename: string;
  size_bytes: number;
  record_count: number;
  checksum: string;
  created_at: string;
  completed_at: string;
  tables: string[];
}

const BACKUP_DIR = resolve('.data/backups');

export class BackupService {
  private timer: NodeJS.Timeout | null = null;
  private intervalHours = 6;
  private isRunning = false;

  constructor() {
    try {
      if (!existsSync(BACKUP_DIR)) {
        mkdirSync(BACKUP_DIR, { recursive: true });
      }
    } catch {
      // Ignore if directory already exists
    }
  }

  startRecurring(db: Database, intervalHours = 6) {
    this.intervalHours = intervalHours;
    if (this.timer) clearInterval(this.timer);

    console.log(
      `[BackupService] Automated recurring backups scheduled every ${intervalHours} hours.`,
    );
    // Run an automated backup after 1 minute, then every interval
    setTimeout(() => {
      void this.createBackup(db, undefined, undefined, 'automated_hourly').catch((err) =>
        console.error('[BackupService] Initial backup error:', err),
      );
    }, 60000);

    this.timer = setInterval(
      () => {
        void this.createBackup(db, undefined, undefined, 'automated_daily').catch((err) =>
          console.error('[BackupService] Recurring backup error:', err),
        );
      },
      intervalHours * 3600 * 1000,
    );
  }

  stopRecurring() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async createBackup(
    db: Database,
    orgId?: string,
    userId?: string,
    type: 'manual' | 'automated_hourly' | 'automated_daily' = 'manual',
  ): Promise<BackupMetadata> {
    if (this.isRunning) {
      throw new Error('A backup is currently in progress. Please wait.');
    }
    this.isRunning = true;
    const startTime = new Date();

    try {
      if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

      const tablesToBackup = [
        'organisations',
        'projects',
        'project_memberships',
        'facilities',
        'medicine_products',
        'inventory_records',
        'consumption_records',
        'deliveries',
        'budgets',
        'funding_releases',
        'procurement_events',
        'expenditure_records',
        'datasets',
        'dataset_versions',
        'operational_alerts',
        'action_items',
        'milestones',
        'recommendations',
        'approvals',
        'evidence_records',
        'problem_briefs',
        'risk_assessments',
        'learning_modules',
        'learning_progress',
        'audit_logs',
      ];

      const dump: Record<string, unknown[]> = {};
      let totalRecords = 0;

      await db.admin(async (c) => {
        for (const tbl of tablesToBackup) {
          try {
            const query = orgId
              ? `select * from ${tbl} where organisation_id = $1`
              : `select * from ${tbl}`;
            const res = orgId ? await c.query(query, [orgId]) : await c.query(query);
            dump[tbl] = res.rows;
            totalRecords += res.rows.length;
          } catch {
            dump[tbl] = [];
          }
        }
      });

      const jsonStr = JSON.stringify(
        {
          version: '1.0',
          engine: 'AfriScope AI / Supabase PostgreSQL',
          created_at: startTime.toISOString(),
          organisation_id: orgId || 'all',
          total_records: totalRecords,
          data: dump,
        },
        null,
        2,
      );

      const checksum = createHash('sha256').update(jsonStr).digest('hex');
      const filename = `afriscope-backup-${startTime.toISOString().replace(/[:.]/g, '-')}-${type}.json`;
      const filePath = resolve(BACKUP_DIR, filename);
      const sizeBytes = Buffer.byteLength(jsonStr, 'utf8');

      // Serverless deployments have a read-only filesystem: the snapshot is
      // stored in the database (source of truth) and the disk copy is a
      // best-effort convenience for long-running local/Docker deployments.
      let storedOnDisk = true;
      try {
        writeFileSync(filePath, jsonStr, 'utf8');
      } catch (error) {
        storedOnDisk = false;
        console.warn(
          '[BackupService] Disk write failed; snapshot kept in the database only:',
          (error as Error).message,
        );
      }
      const completedAt = new Date().toISOString();

      let backupId = '';
      await db.admin(async (c) => {
        const res = await c.query(
          `insert into backups (
            organisation_id, status, backup_type, filename, size_bytes, record_count, checksum, metadata, payload, created_by, created_at, completed_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
          [
            orgId || null,
            'Completed',
            type,
            filename,
            sizeBytes,
            totalRecords,
            checksum,
            JSON.stringify({
              tables: tablesToBackup,
              node_env: process.env.NODE_ENV,
              stored_on_disk: storedOnDisk,
            }),
            jsonStr,
            userId || null,
            startTime.toISOString(),
            completedAt,
          ],
        );
        backupId = String(res.rows[0]?.id);
      });

      const metadata: BackupMetadata = {
        id: backupId,
        backup_type: type,
        status: 'Completed',
        filename,
        size_bytes: sizeBytes,
        record_count: totalRecords,
        checksum,
        created_at: startTime.toISOString(),
        completed_at: completedAt,
        tables: tablesToBackup,
      };

      // Notify clients in real-time
      realtime.broadcast({
        id: `backup-${Date.now()}`,
        type: 'backup:completed',
        timestamp: completedAt,
        orgId,
        title: 'Database Backup Completed',
        message: `Successfully backed up ${totalRecords} records across ${tablesToBackup.length} tables (${Math.round(sizeBytes / 1024)} KB).`,
        severity: 'info',
        data: { filename, sizeBytes, recordCount: totalRecords, checksum },
      });

      // Prune old backups (keep last 12)
      this.pruneOldBackups();

      return metadata;
    } finally {
      this.isRunning = false;
    }
  }

  async listBackups(db: Database, orgId?: string): Promise<BackupMetadata[]> {
    return db.admin(async (c) => {
      const query = orgId
        ? `select * from backups where organisation_id = $1 or organisation_id is null order by created_at desc limit 30`
        : `select * from backups order by created_at desc limit 30`;
      const res = orgId ? await c.query(query, [orgId]) : await c.query(query);
      return res.rows.map((r) => ({
        id: String(r.id),
        backup_type: r.backup_type as BackupMetadata['backup_type'],
        status: r.status as BackupMetadata['status'],
        filename: String(r.filename),
        size_bytes: Number(r.size_bytes),
        record_count: Number(r.record_count),
        checksum: String(r.checksum),
        created_at: String(r.created_at),
        completed_at: String(r.completed_at),
        tables: ((r.metadata as Record<string, unknown>)?.tables as string[]) || [],
      }));
    });
  }

  /** Disk copy first; falls back to the database copy on read-only hosts. */
  async getBackupFile(db: Database, filename: string): Promise<Buffer> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const fullPath = resolve(BACKUP_DIR, safeName);
    if (existsSync(fullPath)) return readFileSync(fullPath);
    const row = await db.admin(async (c) => {
      const res = await c.query('select payload from backups where filename=$1 limit 1', [
        safeName,
      ]);
      return res.rows[0];
    });
    if (!row || row.payload == null) throw new Error('Backup snapshot was not found');
    const payload = row.payload;
    return Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8');
  }

  /**
   * Truthful scheduler state. The six-hour loop lives in server/index.ts (the
   * long-running process); serverless functions never keep a timer alive and
   * vercel.json declares no cron, so on Vercel there is no automatic schedule.
   */
  async status(db: Database): Promise<{
    configured: boolean;
    mode: 'in_process' | 'serverless_unconfigured' | 'stopped';
    interval_hours: number;
    last_automatic_at: string | null;
    last_automatic_status: string | null;
    last_run_at: string | null;
    note: string;
  }> {
    const rows = await db.admin(async (c) => {
      const res = await c.query(
        `select backup_type, status, created_at from backups
          where backup_type like 'automated%' order by created_at desc limit 1`,
      );
      const latest = await c.query(
        'select created_at from backups order by created_at desc limit 1',
      );
      return { automatic: res.rows[0], latest: latest.rows[0] };
    });
    const serverless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;
    const inProcess = this.timer !== null;
    const configured = inProcess && !serverless;
    return {
      configured,
      mode: configured ? 'in_process' : serverless ? 'serverless_unconfigured' : 'stopped',
      interval_hours: this.intervalHours,
      last_automatic_at: rows.automatic?.created_at ? String(rows.automatic.created_at) : null,
      last_automatic_status: rows.automatic?.status ? String(rows.automatic.status) : null,
      last_run_at: rows.latest?.created_at ? String(rows.latest.created_at) : null,
      note: configured
        ? `An in-process scheduler takes a snapshot every ${this.intervalHours} hours and keeps the last 12.`
        : serverless
          ? 'This deployment runs on serverless functions, which cannot hold a background timer, and no scheduled job is configured. Automatic backups are not running; use "Create snapshot now" or configure a scheduled job.'
          : 'No automatic backup scheduler is running in this process. Use "Create snapshot now" or start the standalone server, which enables the six-hour schedule.',
    };
  }

  private pruneOldBackups(keepCount = 12) {
    try {
      if (!existsSync(BACKUP_DIR)) return;
      const files = readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('afriscope-backup-') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (files.length > keepCount) {
        for (const fileToDelete of files.slice(keepCount)) {
          try {
            unlinkSync(resolve(BACKUP_DIR, fileToDelete));
          } catch {
            // ignore cleanup error
          }
        }
      }
    } catch {
      // ignore pruning error
    }
  }
}

export const backupService = new BackupService();
