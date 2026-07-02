/**
 * platform_invoice_settings tablosunu Supabase'e uygular
 * Kullanım: npx tsx src/scripts/apply-invoice-migration.ts
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const MIGRATION_FILE = path.join(
  __dirname,
  '../../../supabase/migrations/027_platform_invoice_settings.sql'
);

async function tableExists(): Promise<boolean> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await supabase.from('platform_invoice_settings').select('id').limit(1);
  if (!error) return true;
  if (error.code === 'PGRST205' || error.message.includes('does not exist')) return false;
  throw new Error(error.message);
}

async function applyWithPg(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL tanımlı değil — Supabase → Settings → Database → Connection string');
  }

  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    await client.query(`
      INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES ('027', '027_platform_invoice_settings')
      ON CONFLICT (version) DO NOTHING
    `).catch(() => {
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

  if (await tableExists()) {
    console.log('✅ platform_invoice_settings zaten mevcut');
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ Tablo yok ve DATABASE_URL tanımlı değil.');
    console.error('   Supabase Dashboard → SQL Editor içinde şu dosyayı çalıştırın:');
    console.error('   supabase/migrations/027_platform_invoice_settings.sql');
    process.exit(1);
  }

  console.log('▶ Migration uygulanıyor...');
  await applyWithPg();

  if (await tableExists()) {
    console.log('✅ platform_invoice_settings oluşturuldu');
  } else {
    throw new Error('Migration sonrası tablo doğrulanamadı');
  }
}

main().catch((err) => {
  console.error('Migration başarısız:', err instanceof Error ? err.message : err);
  process.exit(1);
});
