/**
 * Supabase migration runner - executes SQL files in order
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const MIGRATIONS_DIR = path.join(__dirname, '../../../database/migrations');

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL gerekli');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✅ PostgreSQL bağlantısı kuruldu');

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`▶ Çalıştırılıyor: ${file}`);
    try {
      await client.query(sql);
      console.log(`  ✅ ${file} tamamlandı`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        console.log(`  ⚠️  ${file} zaten mevcut, atlanıyor`);
      } else {
        console.error(`  ❌ ${file} hata:`, msg);
        throw err;
      }
    }
  }

  await client.end();
  console.log('\n🎉 Tüm migration\'lar tamamlandı!');
}

run().catch((e) => {
  console.error('Migration başarısız:', e.message);
  process.exit(1);
});
