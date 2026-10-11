import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { migrate } from '../scripts/migrate-database.mjs';

test('checked migrations are repeatable and failed DDL rolls back with its migration record', async () => {
  const client = createClient({ url: 'file::memory:' });
  const directory = await mkdtemp(join(tmpdir(), 'sovt-migration-'));
  try {
    await migrate(client);
    await migrate(client);
    assert.equal((await client.execute('SELECT count(*) AS n FROM schema_migrations')).rows[0].n, 1);
    await mkdir(join(directory, 'meta'));
    await writeFile(join(directory, 'meta/_journal.json'), JSON.stringify({ entries: [{ tag: 'broken' }] }));
    await writeFile(join(directory, 'broken.sql'), 'CREATE TABLE rollback_probe(id TEXT);--> statement-breakpoint\nINSERT INTO missing_table VALUES(1);');
    await assert.rejects(migrate(client, pathToFileURL(`${directory}/`)));
    assert.equal((await client.execute("SELECT name FROM sqlite_master WHERE name='rollback_probe'")).rows.length, 0);
    assert.equal((await client.execute("SELECT name FROM schema_migrations WHERE name='broken'")).rows.length, 0);
    await client.execute("UPDATE schema_migrations SET checksum='tampered'");
    await assert.rejects(migrate(client), /Applied migration changed/);
  } finally {
    client.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('attendance facade preserves foreign keys, atomic writes, rows and exact late boundary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sovt-database-'));
  const url = pathToFileURL(join(directory, 'attendance.db')).href;
  process.env.TURSO_DATABASE_URL = url;
  const client = createClient({ url });
  try {
    await migrate(client);
    const { database } = await import('../lib/database.ts');
    const db = database();
    await assert.rejects(db.batch([
      db.prepare('INSERT INTO audits VALUES(?,?,?,?,?)').bind('probe', 'test', 'test', 'rollback', '2026-01-01'),
      db.prepare('INSERT INTO enrollments VALUES(?,?)').bind('missing-course', 'missing-student'),
    ]), /FOREIGN KEY/i);
    assert.equal(await db.prepare('SELECT * FROM audits WHERE id=?').bind('probe').first(), null);
    const boundary = await db.prepare(`SELECT
      julianday(?) >= julianday(?, '+10 minutes') AS late,
      julianday(?) >= julianday(?, '+10 minutes') AS before`).bind(
        '2026-01-01T00:10:00.000Z', '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:09:59.999Z', '2026-01-01T00:00:00.000Z',
      ).first();
    assert.deepEqual(boundary, { late: 1, before: 0 });
    await db.prepare('INSERT INTO audits VALUES(?,?,?,?,?)').bind('ok', 'test', 'test', 'committed', '2026-01-01').run();
    assert.equal((await db.prepare('SELECT id FROM audits').all()).results[0].id, 'ok');
  } finally {
    client.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('production refuses an ephemeral local database', async () => {
  process.env.NODE_ENV = 'production';
  process.env.TURSO_DATABASE_URL = 'file::memory:';
  const { database } = await import('../lib/database.ts?production-guard');
  assert.throws(database, /hosted libSQL database/);
  delete process.env.NODE_ENV;
});
