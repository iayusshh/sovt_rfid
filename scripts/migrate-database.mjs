import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function migrate(client, directory = new URL('../drizzle/', import.meta.url)) {
  await client.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL
  )`);
  const journal = JSON.parse(await readFile(new URL('meta/_journal.json', directory), 'utf8'));
  for (const { tag } of journal.entries) {
    if (!/^[a-zA-Z0-9_]+$/.test(tag)) throw new Error('Invalid migration name');
    const source = await readFile(new URL(`${tag}.sql`, directory), 'utf8');
    const checksum = createHash('sha256').update(source).digest('hex');
    const transaction = await client.transaction('write');
    try {
      const previous = await transaction.execute({
        sql: 'SELECT checksum FROM schema_migrations WHERE name=?', args: [tag],
      });
      if (previous.rows.length) {
        if (previous.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${tag}`);
        await transaction.commit();
        continue;
      }
      const statements = source.split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean);
      for (const sql of statements) await transaction.execute(sql);
      await transaction.execute({
        sql: 'INSERT INTO schema_migrations(name,checksum,applied_at) VALUES(?,?,?)',
        args: [tag, checksum, new Date().toISOString()],
      });
      await transaction.commit();
      console.log(`Applied ${tag}`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('Set TURSO_DATABASE_URL before migrating');
  if (process.env.NODE_ENV === 'production' && !/^(libsql|https):\/\//.test(url)) {
    throw new Error('Production requires a hosted libSQL database');
  }
  if (/^(libsql|https):\/\//.test(url) && !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('Set TURSO_AUTH_TOKEN before migrating a hosted database');
  }
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  try { await migrate(client); } finally { client.close(); }
}
