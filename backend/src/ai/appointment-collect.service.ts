/**
 * Randevu bilgisi toplama — kayıt öncesi zorunlu alan kontrolü
 */

export interface HistoryMsg {
  sender_type: string;
  message: string;
}

export interface CollectedAppointmentFields {
  customer_name: string | null;
  customer_phone: string | null;
  title: string | null;
  doctor_name: string | null;
}

export type MissingAppointmentField = 'name' | 'phone' | 'title';

const PHONE_RE = /(?:\+?90|0)?[\s-]?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{10,15}/;

function normalizePhone(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('0')) d = `90${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('5')) d = `90${d}`;
  return d;
}

function extractPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  if (!m) return null;
  const n = normalizePhone(m[0]);
  return n.length >= 10 ? n : null;
}

function isValidFullName(name: string): boolean {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.every((p) => p.length >= 2);
}

/** Konuşma geçmişinden toplanan bilgileri çıkar */
export function parseCollectedFields(
  history: HistoryMsg[],
  latestMessage: string
): CollectedAppointmentFields {
  const messages = [...history, { sender_type: 'customer', message: latestMessage }];
  let customer_name: string | null = null;
  let customer_phone: string | null = null;
  let title: string | null = null;
  let doctor_name: string | null = null;

  for (let i = 0; i < messages.length - 1; i++) {
    const curr = messages[i];
    const next = messages[i + 1];
    if (curr.sender_type !== 'ai' || next.sender_type !== 'customer') continue;

    const ai = curr.message.toLocaleLowerCase('tr');
    const cust = next.message.trim();
    if (!cust || cust.length < 2) continue;

    if (/ad.{0,25}soyad|isminiz|adınız|ad soyad/.test(ai) && !/^\d+$/.test(cust)) {
      customer_name = cust;
    }
    if (/telefon|numara|cep/.test(ai)) {
      const p = extractPhone(cust);
      if (p) customer_phone = p;
    }
    if (/işlem|islem|konu|muayene|hizmet|ne için|ne icin|hangi işlem/.test(ai)) {
      if (!extractPhone(cust)) title = cust;
    }
    if (/doktor|hekim|doktor tercih/.test(ai) && !/^(yok|hayır|hayir|farketmez|yoktur)$/i.test(cust)) {
      doctor_name = cust;
    }
  }

  // Müşteri mesajlarında doğrudan telefon
  for (const m of messages) {
    if (m.sender_type !== 'customer') continue;
    const p = extractPhone(m.message);
    if (p && !customer_phone) customer_phone = p;
  }

  return { customer_name, customer_phone, title, doctor_name };
}

export function getMissingRequiredFields(
  collected: CollectedAppointmentFields,
  fromAction?: {
    customer_name?: string;
    customer_phone?: string;
    title?: string;
  }
): MissingAppointmentField[] {
  const name = (fromAction?.customer_name || collected.customer_name || '').trim();
  const phone = normalizePhone(fromAction?.customer_phone || collected.customer_phone || '');
  const titleText = (fromAction?.title || collected.title || '').trim();

  const missing: MissingAppointmentField[] = [];
  if (!isValidFullName(name)) missing.push('name');
  if (!phone || phone.length < 10) missing.push('phone');
  if (!titleText || titleText.length < 2) missing.push('title');
  return missing;
}

export function promptForMissingField(field: MissingAppointmentField): string {
  switch (field) {
    case 'name':
      return 'Randevu oluşturabilmem için önce ad ve soyadınızı yazar mısınız?';
    case 'phone':
      return 'Teşekkürler. Randevu için cep telefon numaranızı yazar mısınız?';
    case 'title':
      return 'Hangi işlem veya muayene için randevu almak istediğinizi kısaca yazar mısınız?';
    default:
      return 'Randevu için eksik bilgileri tamamlayalım. Ad soyad, telefon ve işlem özetinizi yazar mısınız?';
  }
}

export function getFirstMissingPrompt(
  collected: CollectedAppointmentFields,
  fromAction?: { customer_name?: string; customer_phone?: string; title?: string }
): string | null {
  const missing = getMissingRequiredFields(collected, fromAction);
  if (missing.length === 0) return null;
  return promptForMissingField(missing[0]);
}

export function mergeCollectedWithAction<T extends {
  customer_name?: string;
  customer_phone?: string;
  title?: string;
  doctor_name?: string;
  preferred_doctor?: string;
}>(
  collected: CollectedAppointmentFields,
  action: T
): T & { customer_name: string; customer_phone: string; title: string } {
  return {
    ...action,
    customer_name: (action.customer_name?.trim() || collected.customer_name || '').trim(),
    customer_phone: normalizePhone(action.customer_phone?.trim() || collected.customer_phone || ''),
    title: (action.title?.trim() || collected.title || '').trim(),
    doctor_name: action.doctor_name || action.preferred_doctor || collected.doctor_name || undefined,
  };
}

/** Kayıt denemesi öncesi — eksik alan varsa engelle */
export function blockBookingIfIncomplete(
  history: HistoryMsg[],
  latestMessage: string,
  fromAction?: { customer_name?: string; customer_phone?: string; title?: string }
): { blocked: boolean; message: string | null; collected: CollectedAppointmentFields } {
  const collected = parseCollectedFields(history, latestMessage);
  const prompt = getFirstMissingPrompt(collected, fromAction);
  if (prompt) {
    return { blocked: true, message: prompt, collected };
  }
  return { blocked: false, message: null, collected };
}
