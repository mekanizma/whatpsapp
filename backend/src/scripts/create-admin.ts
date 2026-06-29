/**
 * İlk super admin kullanıcısı oluşturur
 * Kullanım: ADMIN_EMAIL=x ADMIN_PASSWORD=y npx tsx src/scripts/create-admin.ts
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_NAME || 'Platform Admin';

if (!email || !password) {
  console.error('ADMIN_EMAIL ve ADMIN_PASSWORD environment variable gerekli');
  process.exit(1);
}

const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const { data: existing } = await client.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email === email);

  let userId: string;

  if (found) {
    userId = found.id;
    console.log('Kullanıcı zaten mevcut:', email);
  } else {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'super_admin' },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log('✅ Kullanıcı oluşturuldu:', email);
  }

  const { error: profileError } = await client
    .from('profiles')
    .update({ role: 'super_admin', company_id: null, full_name: fullName })
    .eq('user_id', userId);

  if (profileError) {
    // Profil trigger ile oluşmamış olabilir, insert dene
    await client.from('profiles').upsert({
      user_id: userId,
      full_name: fullName,
      role: 'super_admin',
      company_id: null,
    });
  }

  console.log('✅ Super admin rolü atandı');
  console.log('   Admin giriş: http://localhost:5173/admin/login');
}

main().catch((e) => {
  console.error('Hata:', e.message);
  process.exit(1);
});
