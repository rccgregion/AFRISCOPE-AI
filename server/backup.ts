import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Database } from './db';
import { realtime } from './realtime';

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

    console.log(`[BackupService] Automated recurring backups scheduled every ${intervalHours} hours.`);
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

      writeFileSync(filePath, jsonStr, 'utf8');
      const sizeBytes = Buffer.byteLength(jsonStr, 'utf8');
      const completedAt = new Date().toISOString();

      let backupId = '';
      await db.admin(async (c) => {
        const res = await c.query(
          `insert into backups (
            organisation_id, status, backup_type, filename, size_bytes, record_count, checksum, metadata, created_by, created_at, completed_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
          [
            orgId || null,
            'Completed',
            type,
            filename,
            sizeBytes,
            totalRecords,
            checksum,
            JSON.stringify({ tables: tablesToBackup, node_env: process.env.NODE_ENV }),
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

  getBackupFile(filename: string): Buffer {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const fullPath = resolve(BACKUP_DIR, safeName);
    if (!existsSync(fullPath)) {
      throw new Error('Backup file not found on disk');
    }
    return readFileSync(fullPath);
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
