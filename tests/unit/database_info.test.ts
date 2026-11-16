import { describe, it, expect } from 'vitest';
import { describeConnection } from '../../server/db';

// Part 5.5: Settings > Environment must name the database actually in use, and
// must never expose credentials while doing so.
describe('describeConnection', () => {
  const secret = 'postgresql://app_user:sup3rSecret@db.example.org:5432/afriscope';

  it('names the host, port and database', () => {
    const info = describeConnection(secret);
    expect(info.driver).toBe('postgres');
    expect(info.host).toBe('db.example.org');
    expect(info.database).toBe('afriscope');
    expect(info.ephemeral).toBe(false);
    expect(info.label).toContain('db.example.org:5432/afriscope');
  });

  it('never includes the password or the user in the label', () => {
    const info = describeConnection(secret);
    const serialised = JSON.stringify(info);
    expect(serialised).not.toContain('sup3rSecret');
    expect(serialised).not.toContain('app_user');
  });

  it('recognises a Supabase pooler host', () => {
    const info = describeConnection(
      'postgresql://postgres:abc@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
    );
    expect(info.label).toContain('Supabase pooler');
    expect(info.host).toBe('aws-0-eu-west-1.pooler.supabase.com');
  });

  it('does not echo an unparseable connection string', () => {
    const info = describeConnection('not a url at all');
    expect(JSON.stringify(info)).not.toContain('not a url');
    expect(info.driver).toBe('postgres');
  });
});
