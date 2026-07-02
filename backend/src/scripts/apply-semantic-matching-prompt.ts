/**
 * 028_semantic_matching_prompt migration'ını Supabase'e uygular
 * Kullanım: npx tsx src/scripts/apply-semantic-matching-prompt.ts
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const MIGRATION_FILE = path.join(
  __dirname,
  '../../../supabase/migrations/028_semantic_matching_prompt.sql'
);

async function promptAlreadyUpdated(): Promise<boolean> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await supabase
    .from('ai_prompt_templates')
    .select('content')
    .eq('prompt_key', 'system')
    .single();

  if (error) throw new Error(error.message);
  return (data?.content || '').includes('SEMANTİK EŞLEŞTİRME');
}

async function applyWithPg(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL tanımlı değil');
  }

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    await client
      .query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name)
         VALUES ('028', '028_semantic_matching_prompt')
         ON CONFLICT (version) DO NOTHING`
      )
      .catch(() => {
        /* schema_migrations yoksa yoksay */
      });
  } finally {
    await client.end();
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli');
    process.exit(1);
  }

  if (await promptAlreadyUpdated()) {
    console.log('✅ Semantik eşleştirme promptu zaten Supabase\'de güncel');
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL tanımlı değil.');
    console.error('   Supabase Dashboard → SQL Editor içinde çalıştırın:');
    console.error('   supabase/migrations/028_semantic_matching_prompt.sql');
    process.exit(1);
  }

  console.log('▶ 028 migration uygulanıyor...');
  await applyWithPg();

  if (await promptAlreadyUpdated()) {
    console.log('✅ Semantik eşleştirme promptu Supabase\'e eklendi');
  } else {
    throw new Error('Migration sonrası prompt doğrulanamadı');
  }
}

main().catch((err) => {
  console.error('Migration başarısız:', err instanceof Error ? err.message : err);
  process.exit(1);
});
