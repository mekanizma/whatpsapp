/**
 * Randevu DB entegrasyon testi — oluştur, doğrula, sil
 */
import dotenv from 'dotenv';
dotenv.config();

import {
  createAppointment,
  deleteAppointment,
  listAppointments,
} from '../services/appointment.service';
import { extractOfferedSlotFromHistory, formatSlotTurkish } from '../ai/appointment-slot.service';
import { blockBookingIfIncomplete } from '../ai/appointment-collect.service';
import { isAppointmentConfirmation } from '../ai/appointment-extract.service';

const COMPANY_ID = 'a0000000-0000-0000-0000-000000000001';
const REF = new Date('2026-06-30T10:00:00.000Z');

async function run() {
  const history = [
    { sender_type: 'ai', message: 'Ad ve soyadınızı yazar mısınız?' },
    { sender_type: 'customer', message: 'Test Kullanıcı' },
    { sender_type: 'ai', message: 'Cep telefon numaranızı yazar mısınız?' },
    { sender_type: 'customer', message: '05559998877' },
    { sender_type: 'ai', message: 'Hangi işlem için randevu?' },
    { sender_type: 'customer', message: 'Otomatik test randevusu' },
    { sender_type: 'ai', message: "Yarın saat 12:30'da randevu alabilirsiniz. Onaylıyor musunuz?" },
  ];

  console.log('1) Onay tanıma...');
  if (!isAppointmentConfirmation('onaylıyorum')) throw new Error('onaylıyorum tanınmadı');

  console.log('2) Bilgi toplama kilidi...');
  const gate = blockBookingIfIncomplete(history, 'onaylıyorum');
  if (gate.blocked) throw new Error(`Gate engelledi: ${gate.message}`);

  console.log('3) Slot parse (12:30)...');
  const slot = extractOfferedSlotFromHistory(history, REF);
  if (!slot) throw new Error('Slot bulunamadı');
  const formatted = formatSlotTurkish(slot.starts_at, slot.ends_at);
  if (!formatted.includes('12:30')) throw new Error(`Yanlış saat: ${formatted}`);
  console.log(`   Slot: ${formatted}`);

  console.log('4) DB kayıt...');
  const appointment = await createAppointment(COMPANY_ID, {
    customer_phone: '905559998877',
    customer_name: 'Test Kullanıcı',
    title: '[TEST] Otomatik randevu',
    starts_at: slot.starts_at,
    ends_at: slot.ends_at,
    status: 'confirmed',
    source: 'ai',
  });
  console.log(`   Oluşturuldu: ${appointment.id}`);

  console.log('5) Takvim sorgusu...');
  const from = new Date(slot.starts_at);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  const listed = await listAppointments(COMPANY_ID, from.toISOString(), to.toISOString());
  const found = listed.find((a) => a.id === appointment.id);
  if (!found) throw new Error('Randevu takvim sorgusunda bulunamadı');
  console.log(`   Takvimde bulundu: ${formatSlotTurkish(found.starts_at, found.ends_at)}`);

  console.log('6) Temizlik...');
  await deleteAppointment(COMPANY_ID, appointment.id);
  console.log('   Test randevusu silindi');

  console.log('\n✅ Entegrasyon testi başarılı (14 birim + DB)');
}

run().catch((e) => {
  console.error('\n❌ Entegrasyon testi başarısız:', e.message);
  process.exit(1);
});
