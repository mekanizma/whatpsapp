/**
 * Supabase bağlantı test scripti
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function test() {
  console.log('Supabase URL:', url);
  const client = createClient(url, serviceKey);

  const { data, error } = await client.from('companies').select('id').limit(1);

  if (error) {
    if (error.message.includes('does not exist') || error.code === '42P01') {
      console.log('⚠️  Bağlantı OK ama tablolar henüz oluşturulmamış. Migration çalıştırın.');
      process.exit(0);
    }
    console.error('❌ Bağlantı hatası:', error.message);
    process.exit(1);
  }

  console.log('✅ Supabase bağlantısı başarılı!');
  console.log('   companies tablosu erişilebilir.');
}

test();
