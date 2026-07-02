/**
 * 030 + 031 migration'larını Supabase'e uygular
 * Kullanım: npx tsx src/scripts/apply-semantic-search-migration.ts
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const MIGRATIONS = [
  {
    version: '030',
    file: path.join(__dirname, '../../../supabase/migrations/030_multilingual_semantic_matching.sql'),
    verify: async () => {
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data } = await supabase
        .from('ai_prompt_templates')
        .select('content')
        .eq('prompt_key', 'system')
        .single();
      return !!data?.content?.includes('SEMANTİK EŞLEŞTİRME (TÜM DİLLER)');
    },
  },
  {
    version: '031',
    file: path.join(__dirname, '../../../supabase/migrations/031_pure_semantic_search.sql'),
    verify: async (client: pg.Client) => {
      const { rows } = await client.query(`
        SELECT pg_get_functiondef(p.oid) AS def
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'match_knowledge_chunks'
          AND n.nspname = 'public'
        LIMIT 1
      `);
      const def = rows[0]?.def as string | undefined;
      return !!def && def.includes('text_rank') && !def.includes('websearch_to_tsquery');
    },
  },
];

async function migrationApplied(client: pg.Client, version: string): Promise<boolean> {
  const { rows } = await client
    .query(
      `SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1 LIMIT 1`,
      [version]
    )
    .catch(() => ({ rows: [] as { '?column?': number }[] }));
  return rows.length > 0;
}

async function applyMigration(client: pg.Client, version: string, file: string): Promise<void> {
  const sql = fs.readFileSync(file, 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client
      .query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name)
         VALUES ($1, $2)
         ON CONFLICT (version) DO NOTHING`,
        [version, `${version}_applied_by_script`]
      )
      .catch(() => {
        /* schema_migrations yoksa yoksay */
      });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL gerekli — Supabase → Settings → Database → Connection string');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    for (const migration of MIGRATIONS) {
      const already = await migration.verify(
        migration.version === '031' ? client : (null as unknown as pg.Client)
      );

      if (already) {
        console.log(`✅ Migration ${migration.version} zaten uygulanmış`);
        continue;
      }

      if (await migrationApplied(client, migration.version)) {
        console.log(`⚠ Migration ${migration.version} kayıtlı ama doğrulanamadı — yeniden uygulanıyor`);
      }

      console.log(`▶ Migration ${migration.version} uygulanıyor...`);
      await applyMigration(client, migration.version, migration.file);

      const verified = await migration.verify(
        migration.version === '031' ? client : (null as unknown as pg.Client)
      );
      if (!verified) {
        throw new Error(`Migration ${migration.version} doğrulanamadı`);
      }
      console.log(`✅ Migration ${migration.version} tamamlandı`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration başarısız:', err instanceof Error ? err.message : err);
  process.exit(1);
});
