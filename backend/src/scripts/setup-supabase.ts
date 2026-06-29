/**
 * Tam Supabase kurulum scripti
 * Admin + şirket kullanıcıları oluşturur ve profilleri bağlar
 *
 * Kullanım:
 *   ADMIN_EMAIL=gurcem@gmail.com ADMIN_PASSWORD=xxx npx tsx src/scripts/setup-supabase.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const DEMO_COMPANY_ID = 'a0000000-0000-0000-0000-000000000001';

interface UserDef {
  email: string;
  password: string;
  fullName: string;
  role: 'super_admin' | 'company_admin' | 'staff';
  companyId: string | null;
}

async function createOrGetUser(def: UserDef): Promise<string> {
  const { data: list } = await supabase.auth.admin.listUsers();
  const existing = list?.users?.find((u) => u.email === def.email);

  if (existing) {
    console.log(`  ↳ Mevcut kullanıcı: ${def.email}`);
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: def.email,
    password: def.password,
    email_confirm: true,
    user_metadata: { full_name: def.fullName, role: def.role },
  });

  if (error) throw new Error(`${def.email}: ${error.message}`);
  console.log(`  ✅ Oluşturuldu: ${def.email}`);
  return data.user.id;
}

async function upsertProfile(userId: string, def: UserDef): Promise<void> {
  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: userId,
      full_name: def.fullName,
      role: def.role,
      company_id: def.companyId,
      is_active: true,
    },
    { onConflict: 'user_id' }
  );

  if (error) throw new Error(`Profil hatası (${def.email}): ${error.message}`);
  console.log(`  ✅ Profil: ${def.role} → ${def.email}`);
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'gurcem@gmail.com';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('ADMIN_PASSWORD environment variable gerekli');
    process.exit(1);
  }

  console.log('\n🔧 Supabase tam kurulum başlıyor...\n');

  // Bağlantı testi
  const { error: testError } = await supabase.from('companies').select('id').limit(1);
  if (testError) throw new Error(`DB bağlantı hatası: ${testError.message}`);
  console.log('✅ Veritabanı bağlantısı OK\n');

  const users: UserDef[] = [
    {
      email: adminEmail,
      password: adminPassword,
      fullName: 'Gurcem Admin',
      role: 'super_admin',
      companyId: null,
    },
    {
      email: 'firma@demoklinik.com',
      password: adminPassword,
      fullName: 'Demo Klinik Yöneticisi',
      role: 'company_admin',
      companyId: DEMO_COMPANY_ID,
    },
    {
      email: 'personel@demoklinik.com',
      password: adminPassword,
      fullName: 'Ayşe Personel',
      role: 'staff',
      companyId: DEMO_COMPANY_ID,
    },
  ];

  console.log('👤 Kullanıcılar oluşturuluyor...');
  for (const userDef of users) {
    const userId = await createOrGetUser(userDef);
    await upsertProfile(userId, userDef);
  }

  // Şirket kontrolü
  const { data: company } = await supabase
    .from('companies')
    .select('company_name')
    .eq('id', DEMO_COMPANY_ID)
    .single();

  console.log('\n📊 Kurulum özeti:');
  console.log('─────────────────────────────────────');
  console.log(`Şirket    : ${company?.company_name || 'Demo Klinik KKTC'}`);
  console.log(`Admin     : ${adminEmail} / [şifreniz]`);
  console.log(`Şirket    : firma@demoklinik.com / [şifreniz]`);
  console.log(`Personel  : personel@demoklinik.com / [şifreniz]`);
  console.log('─────────────────────────────────────');
  console.log('Admin panel : http://localhost:5173/admin/login');
  console.log('Müşteri panel: http://localhost:5173/login');
  console.log('\n🎉 Kurulum tamamlandı!\n');
}

main().catch((e) => {
  console.error('\n❌ Kurulum hatası:', e.message);
  process.exit(1);
});
