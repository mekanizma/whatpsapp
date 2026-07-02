/**
 * Konuşma dili algılama ve şablon çevirileri
 */

import { detectAll } from 'tinyld';
import { getPromptContent, renderPromptTemplate } from '../services/prompt.service';
import { config } from '../config';

export type ConversationLang = 'tr' | 'en' | 'de' | 'ar' | 'ru' | 'fr' | 'es' | 'other';

const TEMPLATE_LANGS = ['tr', 'en', 'de', 'ar', 'ru', 'fr', 'es'] as const;
type TemplateLang = (typeof TEMPLATE_LANGS)[number];

export const LANG_NAMES: Record<ConversationLang, string> = {
  tr: 'Turkish',
  en: 'English',
  de: 'German',
  ar: 'Arabic',
  ru: 'Russian',
  fr: 'French',
  es: 'Spanish',
  other: "the customer's language (mirror naturally)",
};

const MIN_STICKY_LENGTH = 15;
const HIGH_CONFIDENCE_ACCURACY = 0.5;
const MIN_RELATIVE_CONFIDENCE_RATIO = 1.5;
const MIN_ABSOLUTE_ACCURACY_LONG = 0.12;

const TURKISH_CHAR_RE = /[ğüşıİĞÜŞ]/;
const ARABIC_SCRIPT_RE = /[\u0600-\u06FF]/;
const CYRILLIC_SCRIPT_RE = /[\u0400-\u04FF]/;

function isTemplateLang(code: string): code is TemplateLang {
  return (TEMPLATE_LANGS as readonly string[]).includes(code);
}

function mapDetectedIsoLang(iso2: string): ConversationLang {
  return isTemplateLang(iso2) ? iso2 : 'other';
}

interface MessageLanguageDetection {
  lang: ConversationLang;
  confident: boolean;
}

function isConfidentDetection(
  text: string,
  topLang: string,
  topAccuracy: number,
  secondAccuracy: number
): boolean {
  const len = text.trim().length;
  if (len < MIN_STICKY_LENGTH) return false;

  const mapped = mapDetectedIsoLang(topLang);
  if (mapped === 'other') {
    return (
      topAccuracy >= 0.05 &&
      (secondAccuracy <= 0 || topAccuracy >= secondAccuracy * MIN_RELATIVE_CONFIDENCE_RATIO)
    );
  }

  if (topAccuracy >= HIGH_CONFIDENCE_ACCURACY) return true;
  return (
    topAccuracy >= MIN_ABSOLUTE_ACCURACY_LONG &&
    (secondAccuracy <= 0 || topAccuracy >= secondAccuracy * MIN_RELATIVE_CONFIDENCE_RATIO)
  );
}

/** Tek mesaj için offline dil algılama — konuşma yapışkanlığı uygulanmaz */
function detectSingleMessageLanguage(text: string): MessageLanguageDetection {
  const trimmed = text.trim();
  if (!trimmed) return { lang: 'tr', confident: false };

  if (ARABIC_SCRIPT_RE.test(trimmed)) {
    return { lang: 'ar', confident: true };
  }
  if (CYRILLIC_SCRIPT_RE.test(trimmed)) {
    return { lang: 'ru', confident: true };
  }

  const ranked = detectAll(trimmed);
  if (!ranked.length) return { lang: 'tr', confident: false };

  let top = ranked[0];
  const second = ranked[1]?.accuracy ?? 0;

  if (TURKISH_CHAR_RE.test(trimmed)) {
    const tr = ranked.find((r) => r.lang === 'tr');
    if (tr && (tr.accuracy >= top.accuracy * 0.75 || top.lang !== 'tr')) {
      top = tr.accuracy >= top.accuracy ? tr : { lang: 'tr', accuracy: Math.max(tr.accuracy, top.accuracy) };
    } else if (!tr) {
      top = { lang: 'tr', accuracy: Math.max(top.accuracy, MIN_ABSOLUTE_ACCURACY_LONG) };
    }
  }

  const lang = mapDetectedIsoLang(top.lang);
  return {
    lang,
    confident: isConfidentDetection(trimmed, top.lang, top.accuracy, second),
  };
}

function getStickyLanguageFromHistory(
  history: { sender_type: string; message: string }[]
): ConversationLang | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.sender_type !== 'customer') continue;
    const detection = detectSingleMessageLanguage(entry.message);
    if (detection.confident) return detection.lang;
  }
  return null;
}

export function getLanguageHintName(lang: ConversationLang): string {
  return LANG_NAMES[lang];
}

type MessageKey =
  | 'greeting'
  | 'thanks'
  | 'too_short'
  | 'human_transfer'
  | 'payment'
  | 'refund'
  | 'opt_out'
  | 'sensitive_data'
  | 'prompt_injection'
  | 'complaint'
  | 'transfer_offer'
  | 'frustration'
  | 'transfer_connect'
  | 'quota_exceeded'
  | 'appointment_name'
  | 'appointment_phone'
  | 'appointment_title'
  | 'appointment_missing_default'
  | 'appointment_saved'
  | 'appointment_confirmed'
  | 'appointment_confirmed_doctor'
  | 'appointment_processing'
  | 'kb_topic_intro';

const MESSAGES: Record<MessageKey, Record<TemplateLang, string>> = {
  greeting: {
    tr: 'Merhaba, ben AI destek asistanıyım. Bilgi bankamızdaki konularda size yardımcı olabilirim.',
    en: 'Hello, I am an AI support assistant. I can help you with topics in our knowledge base.',
    de: 'Hallo, ich bin ein KI-Support-Assistent. Ich kann Ihnen zu Themen in unserer Wissensdatenbank helfen.',
    ar: 'مرحباً، أنا مساعد دعم بالذكاء الاصطناعي. يمكنني مساعدتك في مواضيع قاعدة المعرفة لدينا.',
    ru: 'Здравствуйте, я AI-ассистент поддержки. Могу помочь по темам из нашей базы знаний.',
    fr: 'Bonjour, je suis un assistant IA. Je peux vous aider avec les sujets de notre base de connaissances.',
    es: 'Hola, soy un asistente de soporte con IA. Puedo ayudarle con temas de nuestra base de conocimientos.',
  },
  thanks: {
    tr: 'Rica ederiz! Başka bir sorunuz olursa yazabilirsiniz.',
    en: 'You are welcome! Feel free to message us if you have another question.',
    de: 'Gern geschehen! Schreiben Sie uns bei weiteren Fragen.',
    ar: 'عفواً! إذا كان لديك سؤال آخر، يمكنك مراسلتنا.',
    ru: 'Пожалуйста! Напишите нам, если у вас будет ещё вопрос.',
    fr: 'Avec plaisir ! Écrivez-nous si vous avez une autre question.',
    es: '¡De nada! Escríbanos si tiene otra pregunta.',
  },
  too_short: {
    tr: 'Mesajınızı anlayamadım. Lütfen sorunuzu biraz daha detaylı yazın.',
    en: 'I could not understand your message. Please write your question in more detail.',
    de: 'Ich konnte Ihre Nachricht nicht verstehen. Bitte formulieren Sie Ihre Frage ausführlicher.',
    ar: 'لم أفهم رسالتك. يرجى كتابة سؤالك بتفصيل أكثر.',
    ru: 'Я не понял ваше сообщение. Пожалуйста, опишите вопрос подробнее.',
    fr: 'Je n’ai pas compris votre message. Veuillez détailler votre question.',
    es: 'No entendí su mensaje. Por favor, escriba su pregunta con más detalle.',
  },
  human_transfer: {
    tr: 'Elbette. Sizi temsilciye aktarıyorum. Talebinizi doğru yönlendirebilmem için konuyu kısaca yazar mısınız?',
    en: 'Of course. I am connecting you to a representative. Could you briefly describe your request?',
    de: 'Gerne. Ich verbinde Sie mit einem Mitarbeiter. Bitte beschreiben Sie Ihr Anliegen kurz.',
    ar: 'بالتأكيد. سأحوّلك إلى ممثل. هل يمكنك وصف طلبك باختصار؟',
    ru: 'Конечно. Соединяю вас с представителем. Кратко опишите ваш запрос.',
    fr: 'Bien sûr. Je vous mets en relation avec un conseiller. Décrivez brièvement votre demande.',
    es: 'Por supuesto. Le conecto con un representante. ¿Puede describir brevemente su solicitud?',
  },
  payment: {
    tr: 'Ödeme konularında güvenliğiniz için kart veya şifre bilgisi paylaşmayın. Bu konuda sizi temsilciye aktarabilirim. Başka bir sorunuz varsa yardımcı olmaya devam edebilirim.',
    en: 'For your security, do not share card or password details for payments. I can transfer you to a representative for this. I can still help with other questions.',
    de: 'Teilen Sie aus Sicherheitsgründen keine Kartendaten. Ich kann Sie an einen Mitarbeiter weiterleiten. Bei anderen Fragen helfe ich gerne weiter.',
    ar: 'لأمانك، لا تشارك بيانات البطاقة أو كلمة المرور. يمكنني تحويلك إلى ممثل. يمكنني مساعدتك في أسئلة أخرى.',
    ru: 'Не сообщайте данные карты или пароль. Могу перевести к представителю. С другими вопросами тоже помогу.',
    fr: 'Ne partagez pas vos données de carte. Je peux vous transférer à un conseiller. Je peux répondre à d’autres questions.',
    es: 'No comparta datos de tarjeta ni contraseñas. Puedo transferirle a un representante. Puedo ayudar con otras consultas.',
  },
  refund: {
    tr: 'İade işlemleri talep detayına göre kontrol edilmelidir. Sizi temsilciye aktarabilirim. Başka bir konuda yardımcı olabilirim.',
    en: 'Refunds depend on request details. I can transfer you to a representative. I can help with other topics too.',
    de: 'Erstattungen hängen vom Einzelfall ab. Ich kann Sie weiterleiten. Bei anderen Themen helfe ich gerne.',
    ar: 'تعتمد عمليات الاسترداد على تفاصيل الطلب. يمكنني تحويلك إلى ممثل. يمكنني المساعدة في مواضيع أخرى.',
    ru: 'Возвраты зависят от деталей. Могу перевести к представителю. Помогу и с другими вопросами.',
    fr: 'Les remboursements dépendent des détails. Je peux vous transférer. Je peux aider sur d’autres sujets.',
    es: 'Los reembolsos dependen de los detalles. Puedo transferirle a un representante. Puedo ayudar en otros temas.',
  },
  opt_out: {
    tr: 'Talebiniz alındı. Size tekrar bilgilendirme mesajı gönderilmemesi için gerekli kayıt oluşturulacaktır.',
    en: 'Your request has been received. We will register your preference not to receive further messages.',
    de: 'Ihre Anfrage wurde erhalten. Wir vermerken, dass Sie keine weiteren Nachrichten erhalten möchten.',
    ar: 'تم استلام طلبك. سيتم تسجيل رغبتك بعدم تلقي رسائل إضافية.',
    ru: 'Запрос получен. Мы зафиксируем отказ от дальнейших сообщений.',
    fr: 'Demande reçue. Nous enregistrerons votre souhait de ne plus recevoir de messages.',
    es: 'Solicitud recibida. Registraremos que no desea más mensajes.',
  },
  sensitive_data: {
    tr: 'Güvenliğiniz için bu tür bilgileri WhatsApp üzerinden paylaşmayın. Bu konu için sizi temsilciye aktarabilirim.',
    en: 'For your security, do not share such information on WhatsApp. I can transfer you to a representative.',
    de: 'Teilen Sie solche Daten nicht über WhatsApp. Ich kann Sie an einen Mitarbeiter weiterleiten.',
    ar: 'لأمانك، لا تشارك هذه المعلومات عبر واتساب. يمكنني تحويلك إلى ممثل.',
    ru: 'Не отправляйте такие данные в WhatsApp. Могу перевести к представителю.',
    fr: 'Ne partagez pas ces informations sur WhatsApp. Je peux vous transférer.',
    es: 'No comparta esta información por WhatsApp. Puedo transferirle a un representante.',
  },
  prompt_injection: {
    tr: 'Bu bilgiyi paylaşamam. Güvenlik ve gizlilik nedeniyle bu tür taleplere yardımcı olamam. İsterseniz talebinizi temsilciye aktarabilirim.',
    en: 'I cannot share this information. For security reasons I cannot help with such requests. I can transfer you to a representative.',
    de: 'Diese Information kann ich nicht teilen. Aus Sicherheitsgründen kann ich dabei nicht helfen. Ich kann Sie weiterleiten.',
    ar: 'لا يمكنني مشاركة هذه المعلومات. لأسباب أمنية لا يمكنني المساعدة في هذا. يمكنني تحويلك إلى ممثل.',
    ru: 'Я не могу предоставить эту информацию. По соображениям безопасности не могу помочь. Могу перевести к представителю.',
    fr: 'Je ne peux pas partager ces informations. Pour des raisons de sécurité, je ne peux pas aider. Je peux vous transférer.',
    es: 'No puedo compartir esta información. Por seguridad no puedo ayudar con esto. Puedo transferirle.',
  },
  complaint: {
    tr: 'Yaşadığınız durum için üzgünüm. Sizi temsilciye aktarabilirim. İsterseniz başka bir konuda da yardımcı olabilirim.',
    en: 'I am sorry about your experience. I can transfer you to a representative. I can also help with other topics.',
    de: 'Es tut mir leid. Ich kann Sie an einen Mitarbeiter weiterleiten. Ich helfe auch bei anderen Themen.',
    ar: 'أنا آسف لما مررت به. يمكنني تحويلك إلى ممثل. يمكنني المساعدة في مواضيع أخرى أيضاً.',
    ru: 'Сожалею о вашей ситуации. Могу перевести к представителю. Помогу и с другими вопросами.',
    fr: 'Je suis désolé pour votre expérience. Je peux vous transférer. Je peux aussi aider sur d’autres sujets.',
    es: 'Lamento su experiencia. Puedo transferirle a un representante. También puedo ayudar en otros temas.',
  },
  transfer_offer: {
    tr: 'Bu konuda net bilgiye ulaşamadım. Yanlış yönlendirmemek için sizi temsilciye aktarabilirim. Başka bir sorunuz varsa yine yardımcı olmaya devam edebilirim.',
    en: 'I could not find clear information on this. To avoid misguiding you, I can transfer you to a representative. I can still help with other questions.',
    de: 'Dazu habe ich keine klaren Informationen. Ich kann Sie an einen Mitarbeiter weiterleiten. Bei anderen Fragen helfe ich weiter.',
    ar: 'لم أجد معلومات واضحة حول هذا. يمكنني تحويلك إلى ممثل. يمكنني مساعدتك في أسئلة أخرى.',
    ru: 'У меня нет точной информации по этому вопросу. Могу перевести к представителю. С другими вопросами тоже помогу.',
    fr: 'Je n’ai pas d’information claire à ce sujet. Je peux vous transférer. Je peux répondre à d’autres questions.',
    es: 'No encontré información clara sobre esto. Puedo transferirle a un representante. Puedo ayudar con otras consultas.',
  },
  frustration: {
    tr: 'Yaşadığınız olumsuz deneyim için üzgünüm. Sizi hemen canlı destek temsilcimize bağlıyorum. Kısa süre içinde size dönüş yapılacaktır.',
    en: 'I am sorry for your negative experience. I am connecting you to live support. You will be contacted shortly.',
    de: 'Es tut mir leid. Ich verbinde Sie mit dem Live-Support. Sie werden in Kürze kontaktiert.',
    ar: 'أنا آسف لتجربتك السيئة. سأحوّلك إلى الدعم المباشر. سيتم التواصل معك قريباً.',
    ru: 'Сожалею о негативном опыте. Соединяю с живой поддержкой. С вами свяжутся в ближайшее время.',
    fr: 'Je suis désolé pour cette expérience. Je vous mets en relation avec le support. Vous serez contacté bientôt.',
    es: 'Lamento su mala experiencia. Le conecto con soporte en vivo. Le contactarán pronto.',
  },
  transfer_connect: {
    tr: 'Sizi canlı destek temsilcimize bağlıyorum.',
    en: 'I am connecting you to our live support representative.',
    de: 'Ich verbinde Sie mit unserem Live-Support.',
    ar: 'أحوّلك إلى ممثل الدعم المباشر.',
    ru: 'Соединяю вас с представителем поддержки.',
    fr: 'Je vous mets en relation avec notre support.',
    es: 'Le conecto con nuestro representante de soporte.',
  },
  quota_exceeded: {
    tr: 'AI görüşme limitinize ulaşıldı. Lütfen yöneticinizle iletişime geçin.',
    en: 'Message limit reached. Please contact your administrator.',
    de: 'Nachrichtenlimit erreicht. Bitte kontaktieren Sie Ihren Administrator.',
    ar: 'تم الوصول إلى حد الرسائل. يرجى التواصل مع المسؤول.',
    ru: 'Достигнут лимит сообщений. Свяжитесь с администратором.',
    fr: 'Limite de messages atteinte. Contactez votre administrateur.',
    es: 'Se alcanzó el límite de mensajes. Contacte a su administrador.',
  },
  appointment_name: {
    tr: 'Randevu oluşturabilmem için önce ad ve soyadınızı yazar mısınız?',
    en: 'To book an appointment, could you please share your first and last name?',
    de: 'Für einen Termin benötige ich bitte Ihren Vor- und Nachnamen.',
    ar: 'لحجز موعد، يرجى كتابة اسمك واسم العائلة.',
    ru: 'Для записи укажите, пожалуйста, имя и фамилию.',
    fr: 'Pour prendre rendez-vous, indiquez votre prénom et nom.',
    es: 'Para reservar una cita, indique su nombre y apellido.',
  },
  appointment_phone: {
    tr: 'Teşekkürler. Randevu için cep telefon numaranızı yazar mısınız?',
    en: 'Thank you. Please share your mobile phone number for the appointment.',
    de: 'Danke. Bitte geben Sie Ihre Mobilnummer für den Termin an.',
    ar: 'شكراً. يرجى كتابة رقم هاتفك المحمول للموعد.',
    ru: 'Спасибо. Укажите номер мобильного телефона для записи.',
    fr: 'Merci. Indiquez votre numéro de mobile pour le rendez-vous.',
    es: 'Gracias. Indique su número de móvil para la cita.',
  },
  appointment_title: {
    tr: 'Hangi konu/hizmet için randevu almak istediğinizi yazar mısınız?',
    en: 'What topic or service would you like to book an appointment for?',
    de: 'Für welches Thema oder welche Leistung möchten Sie einen Termin?',
    ar: 'ما الموضوع أو الخدمة التي تريد حجز موعد لها؟',
    ru: 'По какой теме или услуге вы хотите записаться?',
    fr: 'Pour quel sujet ou prestation souhaitez-vous un rendez-vous ?',
    es: '¿Para qué tema o servicio desea la cita?',
  },
  appointment_missing_default: {
    tr: 'Randevu için eksik bilgileri tamamlayalım. Ad soyad, telefon ve konu/hizmet özetinizi yazar mısınız?',
    en: 'Let us complete the missing appointment details: name, phone, and topic/service summary.',
    de: 'Bitte ergänzen Sie Name, Telefon und Thema/Leistung für den Termin.',
    ar: 'لنكمل بيانات الموعد: الاسم والهاتف وملخص الموضوع/الخدمة.',
    ru: 'Дополните данные для записи: имя, телефон и тема/услуга.',
    fr: 'Complétez les informations : nom, téléphone et sujet/prestation.',
    es: 'Complete los datos: nombre, teléfono y tema/servicio.',
  },
  appointment_saved: {
    tr: 'Randevunuz kaydedildi: {slot}. {title}',
    en: 'Your appointment is booked: {slot}. {title}',
    de: 'Ihr Termin wurde gebucht: {slot}. {title}',
    ar: 'تم حجز موعدك: {slot}. {title}',
    ru: 'Запись создана: {slot}. {title}',
    fr: 'Votre rendez-vous est enregistré : {slot}. {title}',
    es: 'Su cita quedó registrada: {slot}. {title}',
  },
  appointment_confirmed: {
    tr: 'Randevunuz oluşturuldu.\n\nTarih: {slot}\nAd Soyad: {name}\nKonu: {title}\nTelefon: {phone}{doctor_line}\n\nRandevu saatinde sizi bekliyoruz. Değişiklik veya iptal için bize yazabilirsiniz.',
    en: 'Your appointment is confirmed.\n\nDate: {slot}\nName: {name}\nTopic: {title}\nPhone: {phone}{doctor_line}\n\nWe look forward to seeing you. Message us for any changes or cancellation.',
    de: 'Ihr Termin wurde bestätigt.\n\nDatum: {slot}\nName: {name}\nThema: {title}\nTelefon: {phone}{doctor_line}\n\nWir freuen uns auf Ihren Besuch. Schreiben Sie uns bei Änderungen oder Absage.',
    ar: 'تم تأكيد موعدك.\n\nالتاريخ: {slot}\nالاسم: {name}\nالموضوع: {title}\nالهاتف: {phone}{doctor_line}\n\nننتظر زيارتكم. راسلونا لأي تغيير أو إلغاء.',
    ru: 'Ваша запись подтверждена.\n\nДата: {slot}\nИмя: {name}\nТема: {title}\nТелефон: {phone}{doctor_line}\n\nЖдём вас в назначенное время. Напишите нам для изменений или отмены.',
    fr: 'Votre rendez-vous est confirmé.\n\nDate : {slot}\nNom : {name}\nSujet : {title}\nTéléphone : {phone}{doctor_line}\n\nNous vous attendons. Écrivez-nous pour modifier ou annuler.',
    es: 'Su cita está confirmada.\n\nFecha: {slot}\nNombre: {name}\nTema: {title}\nTeléfono: {phone}{doctor_line}\n\nLe esperamos. Escríbanos para cambios o cancelación.',
  },
  appointment_confirmed_doctor: {
    tr: '\n{provider_label}: {doctor}',
    en: '\n{provider_label}: {doctor}',
    de: '\n{provider_label}: {doctor}',
    ar: '\n{provider_label}: {doctor}',
    ru: '\n{provider_label}: {doctor}',
    fr: '\n{provider_label}: {doctor}',
    es: '\n{provider_label}: {doctor}',
  },
  appointment_processing: {
    tr: 'Randevu bilgilerinizi aldım. Kayıt için kısa süre içinde size dönüş yapacağız.',
    en: 'I have your appointment details. We will confirm your booking shortly.',
    de: 'Ich habe Ihre Termindaten erhalten. Wir bestätigen den Termin in Kürze.',
    ar: 'استلمت بيانات موعدك. سنؤكد الحجز قريباً.',
    ru: 'Данные для записи получены. Мы скоро подтвердим запись.',
    fr: 'J\'ai bien reçu vos informations. Nous confirmerons le rendez-vous sous peu.',
    es: 'Recibí los datos de su cita. Confirmaremos la reserva en breve.',
  },
  kb_topic_intro: {
    tr: 'Size hangi konuda bilgi vermemi istersiniz? Aşağıdakilerden birini yazabilirsiniz:',
    en: 'What would you like to know about? You can reply with one of these topics:',
    de: 'Zu welchem Thema möchten Sie Informationen? Schreiben Sie eines der folgenden Themen:',
    ar: 'ما الموضوع الذي تريد معرفته؟ يمكنك كتابة أحد المواضيع التالية:',
    ru: 'О чём вы хотите узнать? Напишите одну из тем:',
    fr: 'Sur quel sujet souhaitez-vous des informations ? Choisissez un thème ci-dessous :',
    es: '¿Sobre qué tema desea información? Puede escribir uno de estos temas:',
  },
};

export function t(lang: ConversationLang, key: MessageKey, vars?: Record<string, string>): string {
  const templateLang = lang === 'other' ? 'en' : lang;
  let text = MESSAGES[key][templateLang as TemplateLang] || MESSAGES[key].en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

const PROVIDER_LABELS: Record<TemplateLang, string> = {
  tr: 'İlgili kişi',
  en: 'Staff',
  de: 'Ansprechpartner',
  ar: 'الشخص المسؤول',
  ru: 'Ответственный',
  fr: 'Interlocuteur',
  es: 'Persona de contacto',
};

/** Randevu onayında gösterilecek personel/sağlayıcı etiketi — env veya parametre ile özelleştirilebilir */
export function getAppointmentProviderLabel(
  lang: ConversationLang,
  custom?: string
): string {
  if (custom?.trim()) return custom.trim();
  if (config.ai.appointmentProviderLabel) return config.ai.appointmentProviderLabel;
  const templateLang = lang === 'other' ? 'en' : lang;
  return PROVIDER_LABELS[templateLang] || PROVIDER_LABELS.en;
}

/**
 * Konuşma dili — yapışkan: kısa/düşük güven mesajları son güvenilir müşteri dilini korur.
 * Offline tinyld + script kısayolları; ağ çağrısı yok.
 */
export function detectConversationLanguage(
  message: string,
  history: { sender_type: string; message: string }[] = []
): ConversationLang {
  const text = message.trim();
  const stickyLang = getStickyLanguageFromHistory(history);

  if (!text) return stickyLang ?? 'tr';

  const detection = detectSingleMessageLanguage(text);
  if (!detection.confident) return stickyLang ?? 'tr';

  return detection.lang;
}


export const DEFAULT_LANGUAGE_BLOCK_FALLBACK =
  'LANGUAGE — PRIMARY RULE:\n' +
  "- Always reply in the same language as the customer's most recent message, regardless of the knowledge base language.\n" +
  '- Detected language hint: {{langName}}. Use this only as a hint; mirror the customer\'s actual wording language.\n' +
  '- If the customer switches language, switch immediately.\n' +
  "- Pass knowledge base content in the customer's language; do not add information in another language.";

export async function getLanguagePromptBlock(lang: ConversationLang): Promise<string> {
  const template = await getPromptContent('language_block');
  const content = template.trim() || DEFAULT_LANGUAGE_BLOCK_FALLBACK;
  return renderPromptTemplate(content, { langName: getLanguageHintName(lang) });
}

export function localeForLang(lang: ConversationLang): string {
  const map: Record<TemplateLang, string> = {
    tr: 'tr-TR',
    en: 'en-US',
    de: 'de-DE',
    ar: 'ar-SA',
    ru: 'ru-RU',
    fr: 'fr-FR',
    es: 'es-ES',
  };
  if (lang === 'other') return 'en-US';
  return map[lang] || 'en-US';
}
