/**
 * Konuşma dili algılama ve şablon çevirileri
 */

import { detectAll } from 'tinyld';
import { getPromptContent, renderPromptTemplate } from '../services/prompt.service';
import { config } from '../config';
import {
  getAppointmentProviderLabelForCategory,
  shouldAskAppointmentProvider,
} from '../services/appointment-category.service';

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
  | 'anger_handoff'
  | 'transferred_waiting'
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
  | 'kb_topic_intro'
  | 'weekday_sun'
  | 'weekday_mon'
  | 'weekday_tue'
  | 'weekday_wed'
  | 'weekday_thu'
  | 'weekday_fri'
  | 'weekday_sat'
  | 'appointment_day_closed'
  | 'appointment_hours_outside'
  | 'appointment_break_unavailable'
  | 'appointment_pick_another_time'
  | 'appointment_schedule_line'
  | 'appointment_schedule_break'
  | 'appointment_schedule_closed'
  | 'appointment_no_open_days'
  | 'dept_selection_intro'
  | 'dept_selection_footer'
  | 'dept_forwarded'
  | 'photo_received'
  | 'photo_process_failed'
  | 'photo_transfer_subject'
  | 'photo_transfer_subject_default'
  | 'ai_unavailable'
  | 'demo_welcome'
  | 'demo_welcome_default'
  | 'live_demo_welcome'
  | 'voice_message'
  | 'appointment_validation_datetime_missing'
  | 'appointment_validation_datetime_invalid'
  | 'appointment_incomplete_before_confirm'
  | 'appointment_time_unclear'
  | 'appointment_booking_failed'
  | 'appointment_confirm_prompt'
  | 'appointment_conflict_no_alts'
  | 'appointment_conflict_alts'
  | 'appointment_booking_incomplete_retry'
  | 'appointment_false_success_pending'
  | 'appointment_summary_title'
  | 'appointment_summary_datetime'
  | 'appointment_summary_name'
  | 'appointment_summary_topic'
  | 'appointment_summary_phone'
  | 'appointment_summary_confirm'
  | 'appointment_request_all_fields'
  | 'appointment_request_missing_fields'
  | 'appointment_status_found'
  | 'appointment_status_not_found'
  | 'appointment_field_name'
  | 'appointment_field_phone'
  | 'appointment_field_subject'
  | 'appointment_field_datetime'
  | 'appointment_datetime_required'
  | 'appointment_slot_occupied'
  | 'appointment_db_unavailable'
  | 'appointment_create_system_error'
  | 'appointment_date_needed_for_availability'
  | 'appointment_available_slots'
  | 'appointment_available_for_date'
  | 'appointment_no_available_slots'
  | 'kb_miss_instruction'
  | 'kb_topics_header'
  | 'history_photo'
  | 'history_photo_caption';

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
  anger_handoff: {
    tr: 'Üzgünüm, sizi hemen canlı temsilcimize aktarıyorum.',
    en: 'I am sorry — I am connecting you to a live representative right away.',
    de: 'Es tut mir leid — ich verbinde Sie sofort mit einem Live-Mitarbeiter.',
    ar: 'أنا آسف — سأحوّلك فوراً إلى ممثل مباشر.',
    ru: 'Извините — сейчас соединю вас с живым представителем.',
    fr: 'Je suis désolé — je vous mets tout de suite en relation avec un conseiller.',
    es: 'Lo siento — le conecto de inmediato con un representante en vivo.',
  },
  transferred_waiting: {
    tr: 'Temsilcimiz en kısa sürede sizinle iletişime geçecek.',
    en: 'Our representative will contact you as soon as possible.',
    de: 'Unser Mitarbeiter wird sich in Kürze bei Ihnen melden.',
    ar: 'سيتواصل معك ممثلنا في أقرب وقت.',
    ru: 'Наш представитель свяжется с вами в ближайшее время.',
    fr: 'Notre conseiller vous contactera dans les plus brefs délais.',
    es: 'Nuestro representante se pondrá en contacto con usted lo antes posible.',
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
  weekday_sun: {
    tr: 'Pazar', en: 'Sunday', de: 'Sonntag', ar: 'الأحد', ru: 'воскресенье', fr: 'dimanche', es: 'domingo',
  },
  weekday_mon: {
    tr: 'Pazartesi', en: 'Monday', de: 'Montag', ar: 'الاثنين', ru: 'понедельник', fr: 'lundi', es: 'lunes',
  },
  weekday_tue: {
    tr: 'Salı', en: 'Tuesday', de: 'Dienstag', ar: 'الثلاثاء', ru: 'вторник', fr: 'mardi', es: 'martes',
  },
  weekday_wed: {
    tr: 'Çarşamba', en: 'Wednesday', de: 'Mittwoch', ar: 'الأربعاء', ru: 'среда', fr: 'mercredi', es: 'miércoles',
  },
  weekday_thu: {
    tr: 'Perşembe', en: 'Thursday', de: 'Donnerstag', ar: 'الخميس', ru: 'четверг', fr: 'jeudi', es: 'jueves',
  },
  weekday_fri: {
    tr: 'Cuma', en: 'Friday', de: 'Freitag', ar: 'الجمعة', ru: 'пятница', fr: 'vendredi', es: 'viernes',
  },
  weekday_sat: {
    tr: 'Cumartesi', en: 'Saturday', de: 'Samstag', ar: 'السبت', ru: 'суббота', fr: 'samedi', es: 'sábado',
  },
  appointment_day_closed: {
    tr: '{day} günleri randevu alınamaz.',
    en: 'Appointments are not available on {day}.',
    de: 'Am {day} sind keine Termine möglich.',
    ar: 'لا يمكن حجز مواعيد يوم {day}.',
    ru: 'В {day} запись недоступна.',
    fr: 'Pas de rendez-vous le {day}.',
    es: 'No hay citas los {day}.',
  },
  appointment_hours_outside: {
    tr: '{day} randevuları {open}–{close} arasındadır.',
    en: '{day} appointments are between {open} and {close}.',
    de: 'Termine am {day} sind von {open} bis {close}.',
    ar: 'مواعيد {day} بين {open} و{close}.',
    ru: 'Запись в {day}: с {open} до {close}.',
    fr: 'Les rendez-vous le {day} sont de {open} à {close}.',
    es: 'Las citas los {day} son de {open} a {close}.',
  },
  appointment_break_unavailable: {
    tr: '{breakStart}–{breakEnd} arası randevu verilmemektedir.',
    en: 'Appointments are unavailable between {breakStart} and {breakEnd}.',
    de: 'Zwischen {breakStart} und {breakEnd} sind keine Termine möglich.',
    ar: 'لا توجد مواعيد بين {breakStart} و{breakEnd}.',
    ru: 'Запись недоступна с {breakStart} до {breakEnd}.',
    fr: 'Pas de rendez-vous entre {breakStart} et {breakEnd}.',
    es: 'No hay citas entre {breakStart} y {breakEnd}.',
  },
  appointment_pick_another_time: {
    tr: 'Lütfen çalışma saatleri içinde başka bir saat yazın ({scheduleSummary}).',
    en: 'Please choose another time within working hours ({scheduleSummary}).',
    de: 'Bitte wählen Sie eine andere Uhrzeit innerhalb der Öffnungszeiten ({scheduleSummary}).',
    ar: 'يرجى اختيار وقت آخر ضمن ساعات العمل ({scheduleSummary}).',
    ru: 'Выберите другое время в рабочие часы ({scheduleSummary}).',
    fr: 'Choisissez un autre horaire dans les heures d’ouverture ({scheduleSummary}).',
    es: 'Elija otra hora dentro del horario laboral ({scheduleSummary}).',
  },
  appointment_schedule_line: {
    tr: '{day}: {open}–{close}',
    en: '{day}: {open}–{close}',
    de: '{day}: {open}–{close}',
    ar: '{day}: {open}–{close}',
    ru: '{day}: {open}–{close}',
    fr: '{day} : {open}–{close}',
    es: '{day}: {open}–{close}',
  },
  appointment_schedule_break: {
    tr: '(öğle {breakStart}–{breakEnd} kapalı)',
    en: '(lunch break {breakStart}–{breakEnd})',
    de: '(Pause {breakStart}–{breakEnd})',
    ar: '(استراحة {breakStart}–{breakEnd})',
    ru: '(перерыв {breakStart}–{breakEnd})',
    fr: '(pause {breakStart}–{breakEnd})',
    es: '(descanso {breakStart}–{breakEnd})',
  },
  appointment_schedule_closed: {
    tr: '{days} kapalı',
    en: '{days} closed',
    de: '{days} geschlossen',
    ar: '{days} مغلق',
    ru: '{days} закрыто',
    fr: '{days} fermé',
    es: '{days} cerrado',
  },
  appointment_no_open_days: {
    tr: 'Çalışma günü tanımlı değil',
    en: 'No working days configured',
    de: 'Keine Arbeitstage konfiguriert',
    ar: 'لا توجد أيام عمل محددة',
    ru: 'Рабочие дни не настроены',
    fr: 'Aucun jour ouvré configuré',
    es: 'No hay días laborables configurados',
  },
  dept_selection_intro: {
    tr: 'Sizi doğru ekibe yönlendirebilmemiz için lütfen talebinizin hangi departmanla ilgili olduğunu belirtin:',
    en: 'To connect you with the right team, please tell us which department your request is for:',
    de: 'Damit wir Sie an das richtige Team weiterleiten, nennen Sie bitte die zuständige Abteilung:',
    ar: 'لتحويلك إلى الفريق المناسب، يرجى تحديد القسم المعني بطلبك:',
    ru: 'Чтобы направить вас в нужный отдел, укажите, к какому отделу относится ваш запрос:',
    fr: 'Pour vous orienter vers la bonne équipe, indiquez le service concerné :',
    es: 'Para conectarle con el equipo adecuado, indique el departamento de su solicitud:',
  },
  dept_selection_footer: {
    tr: 'Numara veya departman adıyla yanıt verebilirsiniz.',
    en: 'Reply with the number or department name.',
    de: 'Antworten Sie mit der Nummer oder dem Abteilungsnamen.',
    ar: 'يمكنك الرد برقم أو اسم القسم.',
    ru: 'Ответьте номером или названием отдела.',
    fr: 'Répondez avec le numéro ou le nom du service.',
    es: 'Responda con el número o el nombre del departamento.',
  },
  dept_forwarded: {
    tr: 'Talebiniz {department} ekibine iletildi. Bir temsilcimiz kısa süre içinde size yardımcı olacak.',
    en: 'Your request has been forwarded to the {department} team. A representative will assist you shortly.',
    de: 'Ihre Anfrage wurde an das Team {department} weitergeleitet. Ein Mitarbeiter wird sich in Kürze melden.',
    ar: 'تم تحويل طلبك إلى فريق {department}. سيتواصل معك ممثل قريباً.',
    ru: 'Ваш запрос передан команде {department}. Представитель скоро свяжется с вами.',
    fr: 'Votre demande a été transmise à l’équipe {department}. Un conseiller vous contactera sous peu.',
    es: 'Su solicitud se envió al equipo {department}. Un representante le atenderá en breve.',
  },
  photo_received: {
    tr: 'Fotoğrafınızı aldık. Bir temsilcimiz kısa süre içinde size yardımcı olacak.',
    en: 'Your photo has been received. A representative will assist you shortly.',
    de: 'Wir haben Ihr Foto erhalten. Ein Mitarbeiter wird sich in Kürze melden.',
    ar: 'استلمنا صورتك. سيتواصل معك ممثل قريباً.',
    ru: 'Мы получили ваше фото. Представитель скоро свяжется с вами.',
    fr: 'Nous avons bien reçu votre photo. Un conseiller vous contactera sous peu.',
    es: 'Hemos recibido su foto. Un representante le atenderá en breve.',
  },
  photo_process_failed: {
    tr: 'Üzgünüz, fotoğrafınız işlenemedi. Lütfen tekrar deneyin.',
    en: 'Sorry, we could not process your photo. Please try again.',
    de: 'Entschuldigung, Ihr Foto konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.',
    ar: 'عذراً، تعذر معالجة صورتك. يرجى المحاولة مرة أخرى.',
    ru: 'Извините, не удалось обработать фото. Попробуйте ещё раз.',
    fr: 'Désolé, votre photo n’a pas pu être traitée. Veuillez réessayer.',
    es: 'Lo sentimos, no pudimos procesar su foto. Inténtelo de nuevo.',
  },
  photo_transfer_subject: {
    tr: 'Müşteri fotoğraf gönderdi: {caption}',
    en: 'Customer sent a photo: {caption}',
    de: 'Kunde hat ein Foto gesendet: {caption}',
    ar: 'أرسل العميل صورة: {caption}',
    ru: 'Клиент отправил фото: {caption}',
    fr: 'Le client a envoyé une photo : {caption}',
    es: 'El cliente envió una foto: {caption}',
  },
  photo_transfer_subject_default: {
    tr: 'Müşteri fotoğraf gönderdi',
    en: 'Customer sent a photo',
    de: 'Kunde hat ein Foto gesendet',
    ar: 'أرسل العميل صورة',
    ru: 'Клиент отправил фото',
    fr: 'Le client a envoyé une photo',
    es: 'El cliente envió una foto',
  },
  ai_unavailable: {
    tr: 'Üzgünüz, şu an yanıt veremiyoruz. Lütfen kısa süre sonra tekrar deneyin.',
    en: 'Sorry, we cannot reply right now. Please try again shortly.',
    de: 'Entschuldigung, wir können gerade nicht antworten. Bitte versuchen Sie es später erneut.',
    ar: 'عذراً، لا يمكننا الرد الآن. يرجى المحاولة بعد قليل.',
    ru: 'Извините, сейчас мы не можем ответить. Попробуйте чуть позже.',
    fr: 'Désolé, nous ne pouvons pas répondre pour le moment. Réessayez bientôt.',
    es: 'Lo sentimos, no podemos responder ahora. Inténtelo de nuevo en breve.',
  },
  demo_welcome: {
    tr: 'Merhaba! Mesajınızı aldık. {company} olarak yardımcı olmaktan mutluluk duyarız.',
    en: 'Hello! We received your message. We are happy to help you as {company}.',
    de: 'Hallo! Wir haben Ihre Nachricht erhalten. Gerne helfen wir Ihnen als {company}.',
    ar: 'مرحباً! استلمنا رسالتك. يسعدنا مساعدتك كـ {company}.',
    ru: 'Здравствуйте! Мы получили ваше сообщение. Рады помочь вам — {company}.',
    fr: 'Bonjour ! Nous avons reçu votre message. Nous sommes heureux de vous aider — {company}.',
    es: '¡Hola! Recibimos su mensaje. Estamos encantados de ayudarle como {company}.',
  },
  demo_welcome_default: {
    tr: 'Merhaba! Mesajınızı aldık. Size nasıl yardımcı olabiliriz?',
    en: 'Hello! We received your message. How can we help you?',
    de: 'Hallo! Wir haben Ihre Nachricht erhalten. Wie können wir Ihnen helfen?',
    ar: 'مرحباً! استلمنا رسالتك. كيف يمكننا مساعدتك؟',
    ru: 'Здравствуйте! Мы получили ваше сообщение. Чем можем помочь?',
    fr: 'Bonjour ! Nous avons reçu votre message. Comment pouvons-nous vous aider ?',
    es: '¡Hola! Recibimos su mensaje. ¿Cómo podemos ayudarle?',
  },
  live_demo_welcome: {
    tr: `👋 Merhaba! Ben WAAI AI Müşteri Temsilcisiyim.

İşletmenize özel olarak eğitilebilen bir yapay zekâyım.

Aşağıdaki örneklerden birini deneyebilir veya kendi sorunuzu yazabilirsiniz.

Örnek sorular:

🏨 Otel rezervasyonu nasıl yapılır?
🦷 Diş kliniğinde implant fiyatı hakkında bilgi alabilir miyim?
🎓 Üniversite başvurusu için hangi belgeler gerekli?
🚗 Araç kiralama şartları nelerdir?
🏠 Bu daireyi görmek için randevu oluşturabilir miyim?
💄 Cilt bakımı seansları ne kadar sürüyor?
🍽️ Bugün müsait masa var mı?`,
    en: `👋 Hello! I'm the WAAI AI Customer Representative.

I'm an AI that can be trained specifically for your business.

Try one of the examples below or write your own question.

Example questions:

🏨 How do I make a hotel reservation?
🦷 Can I get information about dental implant prices?
🎓 What documents are required for university application?
🚗 What are the car rental terms?
🏠 Can I schedule a viewing for this apartment?
💄 How long do skincare sessions take?
🍽️ Is there an available table today?`,
    de: `👋 Hallo! Ich bin der WAAI KI-Kundenberater.

Ich bin eine KI, die speziell für Ihr Unternehmen trainiert werden kann.

Probieren Sie eines der Beispiele unten oder stellen Sie Ihre eigene Frage.

Beispielfragen:

🏨 Wie mache ich eine Hotelreservierung?
🦷 Kann ich Informationen zu Zahnimplantat-Preisen erhalten?
🎓 Welche Unterlagen werden für die Universitätsbewerbung benötigt?
🚗 Was sind die Mietwagenbedingungen?
🏠 Kann ich einen Besichtigungstermin für diese Wohnung vereinbaren?
💄 Wie lange dauern Hautpflege-Sitzungen?
🍽️ Gibt es heute einen freien Tisch?`,
    ar: `👋 مرحباً! أنا ممثل خدمة العملاء بالذكاء الاصطناعي من WAAI.

أنا ذكاء اصطناعي يمكن تدريبه خصيصاً لعملك.

جرّب أحد الأمثلة أدناه أو اكتب سؤالك الخاص.

أسئلة مثال:

🏨 كيف أحجز في فندق؟
🦷 هل يمكنني الحصول على معلومات عن أسعار زراعة الأسنان؟
🎓 ما المستندات المطلوبة للتقديم للجامعة؟
🚗 ما شروط تأجير السيارات؟
🏠 هل يمكنني تحديد موعد لمعاينة هذا الشقة؟
💄 كم تستغرق جلسات العناية بالبشرة؟
🍽️ هل يوجد طاولة متاحة اليوم؟`,
    ru: `👋 Здравствуйте! Я AI-представитель WAAI.

Я искусственный интеллект, который можно обучить специально для вашего бизнеса.

Попробуйте один из примеров ниже или задайте свой вопрос.

Примеры вопросов:

🏨 Как забронировать отель?
🦷 Могу ли я узнать цены на импланты?
🎓 Какие документы нужны для поступления в университет?
🚗 Каковы условия аренды автомобиля?
🏠 Могу ли я записаться на просмотр этой квартиры?
💄 Сколько длятся сеансы ухода за кожей?
🍽️ Есть ли свободный столик сегодня?`,
    fr: `👋 Bonjour ! Je suis le représentant client IA de WAAI.

Je suis une IA qui peut être formée spécifiquement pour votre entreprise.

Essayez l'un des exemples ci-dessous ou posez votre propre question.

Exemples de questions :

🏨 Comment réserver un hôtel ?
🦷 Puis-je obtenir des informations sur les prix des implants dentaires ?
🎓 Quels documents sont nécessaires pour une candidature universitaire ?
🚗 Quelles sont les conditions de location de voiture ?
🏠 Puis-je prendre rendez-vous pour visiter cet appartement ?
💄 Combien de temps durent les séances de soins de la peau ?
🍽️ Y a-t-il une table disponible aujourd'hui ?`,
    es: `👋 ¡Hola! Soy el representante de atención al cliente IA de WAAI.

Soy una IA que puede entrenarse específicamente para su negocio.

Pruebe uno de los ejemplos a continuación o escriba su propia pregunta.

Preguntas de ejemplo:

🏨 ¿Cómo hago una reserva de hotel?
🦷 ¿Puedo obtener información sobre precios de implantes dentales?
🎓 ¿Qué documentos se necesitan para la solicitud universitaria?
🚗 ¿Cuáles son las condiciones de alquiler de coches?
🏠 ¿Puedo programar una visita para este apartamento?
💄 ¿Cuánto duran las sesiones de cuidado de la piel?
🍽️ ¿Hay mesa disponible hoy?`,
  },
  voice_message: {
    tr: 'Ben bir AI destek asistanıyım, sesli mesajlarınıza cevap veremiyorum. Lütfen talebinizi yazılı olarak iletin.',
    en: 'I am an AI support assistant and cannot respond to voice messages. Please send your request in writing.',
    de: 'Ich bin ein KI-Support-Assistent und kann auf Sprachnachrichten nicht antworten. Bitte senden Sie Ihre Anfrage schriftlich.',
    ar: 'أنا مساعد دعم بالذكاء الاصطناعي ولا أستطيع الرد على الرسائل الصوتية. يرجى إرسال طلبك كتابةً.',
    ru: 'Я AI-ассистент поддержки и не могу отвечать на голосовые сообщения. Пожалуйста, отправьте ваш запрос в письменном виде.',
    fr: 'Je suis un assistant de support IA et je ne peux pas répondre aux messages vocaux. Veuillez envoyer votre demande par écrit.',
    es: 'Soy un asistente de soporte con IA y no puedo responder a mensajes de voz. Por favor, envíe su solicitud por escrito.',
  },
  appointment_validation_datetime_missing: {
    tr: 'Randevu tarih ve saati eksik.',
    en: 'Appointment date and time are missing.',
    de: 'Termindatum und -uhrzeit fehlen.',
    ar: 'تاريخ ووقت الموعد مفقودان.',
    ru: 'Не указаны дата и время записи.',
    fr: 'La date et l’heure du rendez-vous manquent.',
    es: 'Faltan la fecha y la hora de la cita.',
  },
  appointment_validation_datetime_invalid: {
    tr: 'Randevu saati geçersiz.',
    en: 'The appointment time is invalid.',
    de: 'Die Terminzeit ist ungültig.',
    ar: 'وقت الموعد غير صالح.',
    ru: 'Недопустимое время записи.',
    fr: 'L’horaire du rendez-vous est invalide.',
    es: 'La hora de la cita no es válida.',
  },
  appointment_incomplete_before_confirm: {
    tr: 'Randevuyu kaydetmeden önce özet bilgileri onaylamanız gerekiyor. Lütfen önce tarih/saat ve bilgilerinizi tamamlayın.',
    en: 'Please review the appointment summary before confirming. Complete the date/time and your details first.',
    de: 'Bitte bestätigen Sie zuerst die Terminübersicht. Vervollständigen Sie Datum/Uhrzeit und Ihre Angaben.',
    ar: 'يرجى مراجعة ملخص الموعد قبل التأكيد. أكمل التاريخ/الوقت وبياناتك أولاً.',
    ru: 'Перед подтверждением проверьте сводку записи. Сначала укажите дату/время и данные.',
    fr: 'Veuillez valider le récapitulatif avant confirmation. Complétez d’abord la date/heure et vos informations.',
    es: 'Revise el resumen de la cita antes de confirmar. Complete primero fecha/hora y sus datos.',
  },
  appointment_time_unclear: {
    tr: 'Randevu saatini anlayamadım. Lütfen tarih ve saati tekrar yazın (ör. "15 temmuz saat 14:00" veya "yarın saat 10").',
    en: 'I could not understand the appointment time. Please write the date and time again (e.g. "July 15 at 2 PM" or "tomorrow at 10").',
    de: 'Ich habe die Terminzeit nicht verstanden. Bitte nennen Sie Datum und Uhrzeit erneut.',
    ar: 'لم أفهم وقت الموعد. يرجى كتابة التاريخ والوقت مرة أخرى.',
    ru: 'Я не понял время записи. Укажите дату и время ещё раз.',
    fr: 'Je n’ai pas compris l’horaire. Indiquez à nouveau la date et l’heure.',
    es: 'No entendí la hora de la cita. Escriba de nuevo la fecha y la hora.',
  },
  appointment_booking_failed: {
    tr: 'Randevu kaydedilemedi: {error}',
    en: 'Could not save the appointment: {error}',
    de: 'Termin konnte nicht gespeichert werden: {error}',
    ar: 'تعذر حفظ الموعد: {error}',
    ru: 'Не удалось сохранить запись: {error}',
    fr: 'Impossible d’enregistrer le rendez-vous : {error}',
    es: 'No se pudo guardar la cita: {error}',
  },
  appointment_confirm_prompt: {
    tr: 'Randevu özeti:\n• Tarih: {slot}\n• Ad Soyad: {name}\n• Konu: {title}\n• Telefon: {phone}\n\nKaydetmemi onaylıyor musunuz? "evet" veya "onaylıyorum" yazmanız yeterli.',
    en: 'Appointment summary:\n• Date: {slot}\n• Name: {name}\n• Subject: {title}\n• Phone: {phone}\n\nShall I save this? Reply "yes" or "confirm".',
    de: 'Terminübersicht:\n• Datum: {slot}\n• Name: {name}\n• Thema: {title}\n• Telefon: {phone}\n\nSoll ich speichern? Antworten Sie mit „ja“ oder „bestätigen“.',
    ar: 'ملخص الموعد:\n• التاريخ: {slot}\n• الاسم: {name}\n• الموضوع: {title}\n• الهاتف: {phone}\n\nهل أحفظه؟ اكتب "نعم" أو "أؤكد".',
    ru: 'Сводка записи:\n• Дата: {slot}\n• Имя: {name}\n• Тема: {title}\n• Телефон: {phone}\n\nСохранить? Ответьте «да» или «подтверждаю».',
    fr: 'Récapitulatif :\n• Date : {slot}\n• Nom : {name}\n• Sujet : {title}\n• Téléphone : {phone}\n\nConfirmez-vous ? Répondez « oui » ou « je confirme ».',
    es: 'Resumen de la cita:\n• Fecha: {slot}\n• Nombre: {name}\n• Tema: {title}\n• Teléfono: {phone}\n\n¿La guardo? Responda «sí» o «confirmo».',
  },
  appointment_conflict_no_alts: {
    tr: '{requested} saatinde başka bir randevu var ve yakın zamanda müsait saat bulunamadı. Lütfen farklı bir gün veya saat yazın.',
    en: 'There is already an appointment at {requested} and no nearby slots are available. Please suggest another day or time.',
    de: 'Um {requested} ist bereits ein Termin und es gibt keine nahen freien Zeiten. Bitte nennen Sie einen anderen Tag oder eine andere Uhrzeit.',
    ar: 'يوجد موعد بالفعل في {requested} ولا توجد أوقات قريبة متاحة. يرجى اقتراح يوم أو وقت آخر.',
    ru: 'На {requested} уже есть запись, ближайших слотов нет. Предложите другой день или время.',
    fr: 'Un rendez-vous existe déjà à {requested} et aucun créneau proche n’est libre. Proposez un autre jour ou horaire.',
    es: 'Ya hay una cita a las {requested} y no hay huecos cercanos. Proponga otro día u hora.',
  },
  appointment_conflict_alts: {
    tr: '{requested} saatinde başka bir randevu var. Şu saatler müsait:\n{options}\nHangisini tercih edersiniz? Lütfen numarayı veya saati yazarak onaylayın.',
    en: 'There is already an appointment at {requested}. These times are available:\n{options}\nWhich would you prefer? Reply with the number or time to confirm.',
    de: 'Um {requested} ist bereits ein Termin. Diese Zeiten sind frei:\n{options}\nWelche bevorzugen Sie? Antworten Sie mit Nummer oder Uhrzeit.',
    ar: 'يوجد موعد بالفعل في {requested}. الأوقات المتاحة:\n{options}\nأيها تفضل؟ رد برقم أو وقت للتأكيد.',
    ru: 'На {requested} уже есть запись. Свободно:\n{options}\nЧто выберете? Ответьте номером или временем.',
    fr: 'Un rendez-vous existe déjà à {requested}. Créneaux disponibles :\n{options}\nLequel préférez-vous ? Répondez avec le numéro ou l’heure.',
    es: 'Ya hay una cita a las {requested}. Horarios disponibles:\n{options}\n¿Cuál prefiere? Responda con el número u hora.',
  },
  appointment_booking_incomplete_retry: {
    tr: 'Randevu kaydı tamamlanamadı. Lütfen ad soyad, cep telefonu ve işlem özetinizi tekrar paylaşır mısınız?',
    en: 'The appointment could not be completed. Please share your full name, mobile number, and service summary again.',
    de: 'Der Termin konnte nicht abgeschlossen werden. Bitte senden Sie Name, Mobilnummer und Anliegen erneut.',
    ar: 'تعذر إكمال الموعد. يرجى إرسال الاسم الكامل ورقم الجوال وملخص الخدمة مرة أخرى.',
    ru: 'Запись не завершена. Укажите снова имя, телефон и суть обращения.',
    fr: 'Le rendez-vous n’a pas pu être enregistré. Renvoyez nom, mobile et résumé du service.',
    es: 'No se pudo completar la cita. Envíe de nuevo nombre, móvil y resumen del servicio.',
  },
  appointment_false_success_pending: {
    tr: 'randevu bilgilerinizi aldım, kayıt için onayınızı bekliyorum',
    en: 'I have your appointment details and am waiting for your confirmation to book',
    de: 'Ich habe Ihre Termindaten und warte auf Ihre Bestätigung',
    ar: 'استلمت بيانات موعدك وأنتظر تأكيدك للحجز',
    ru: 'Данные для записи получены, жду вашего подтверждения',
    fr: 'J’ai vos informations de rendez-vous et attends votre confirmation',
    es: 'Tengo los datos de su cita y espero su confirmación',
  },
  appointment_summary_title: {
    tr: 'Randevu özeti:',
    en: 'Appointment summary:',
    de: 'Terminübersicht:',
    ar: 'ملخص الموعد:',
    ru: 'Сводка записи:',
    fr: 'Récapitulatif du rendez-vous :',
    es: 'Resumen de la cita:',
  },
  appointment_summary_datetime: {
    tr: '- Tarih/Saat: {slot}',
    en: '- Date/Time: {slot}',
    de: '- Datum/Uhrzeit: {slot}',
    ar: '- التاريخ/الوقت: {slot}',
    ru: '- Дата/время: {slot}',
    fr: '- Date/Heure : {slot}',
    es: '- Fecha/Hora: {slot}',
  },
  appointment_summary_name: {
    tr: '- Ad Soyad: {name}',
    en: '- Name: {name}',
    de: '- Name: {name}',
    ar: '- الاسم: {name}',
    ru: '- Имя: {name}',
    fr: '- Nom : {name}',
    es: '- Nombre: {name}',
  },
  appointment_summary_topic: {
    tr: '- Konu: {title}',
    en: '- Service: {title}',
    de: '- Anliegen: {title}',
    ar: '- الموضوع: {title}',
    ru: '- Тема: {title}',
    fr: '- Sujet : {title}',
    es: '- Tema: {title}',
  },
  appointment_summary_phone: {
    tr: '- Telefon: {phone}',
    en: '- Phone: {phone}',
    de: '- Telefon: {phone}',
    ar: '- الهاتف: {phone}',
    ru: '- Телефон: {phone}',
    fr: '- Téléphone : {phone}',
    es: '- Teléfono: {phone}',
  },
  appointment_summary_confirm: {
    tr: 'Bu bilgileri onaylıyor musunuz?',
    en: 'Do you confirm these details?',
    de: 'Bestätigen Sie diese Angaben?',
    ar: 'هل تؤكد هذه البيانات؟',
    ru: 'Подтверждаете эти данные?',
    fr: 'Confirmez-vous ces informations ?',
    es: '¿Confirma estos datos?',
  },
  appointment_request_all_fields: {
    tr: 'Randevu oluşturabilmem için lütfen ad soyadınızı, telefon numaranızı, randevu konusunu ve istediğiniz tarih/saati paylaşır mısınız?',
    en: 'To book your appointment, please share your full name, phone number, appointment subject, and preferred date/time.',
    de: 'Für Ihren Termin senden Sie bitte Vor- und Nachname, Telefonnummer, Termingrund sowie gewünschtes Datum und Uhrzeit.',
    ar: 'لإنشاء موعدك، يرجى إرسال الاسم الكامل ورقم الهاتف وموضوع الموعد والتاريخ والوقت المطلوبين.',
    ru: 'Для записи отправьте, пожалуйста, имя и фамилию, телефон, тему визита и желаемые дату и время.',
    fr: 'Pour créer votre rendez-vous, merci d’indiquer votre nom complet, téléphone, objet du rendez-vous et la date/heure souhaitées.',
    es: 'Para crear su cita, comparta su nombre completo, teléfono, motivo de la cita y la fecha/hora deseadas.',
  },
  appointment_request_missing_fields: {
    tr: 'Randevuyu tamamlayabilmem için şu bilgilere ihtiyacım var:\n\n{fields}\n\nLütfen paylaşır mısınız?',
    en: 'To complete your appointment, I still need:\n\n{fields}\n\nCould you share these details?',
    de: 'Für Ihren Termin benötige ich noch:\n\n{fields}\n\nBitte senden Sie diese Angaben.',
    ar: 'لإكمال موعدك، أحتاج إلى:\n\n{fields}\n\nيرجى إرسال هذه البيانات.',
    ru: 'Для завершения записи мне нужны:\n\n{fields}\n\nПожалуйста, отправьте эти данные.',
    fr: 'Pour finaliser votre rendez-vous, il me manque :\n\n{fields}\n\nPouvez-vous les envoyer ?',
    es: 'Para completar su cita, necesito:\n\n{fields}\n\n¿Puede compartir estos datos?',
  },
  appointment_status_found: {
    tr: 'Evet, randevunuz kayıtlı.\n\nTarih: {slot}\nKonu: {title}\nDurum: {status}',
    en: 'Yes, your appointment is on file.\n\nDate: {slot}\nSubject: {title}\nStatus: {status}',
    de: 'Ja, Ihr Termin ist eingetragen.\n\nDatum: {slot}\nThema: {title}\nStatus: {status}',
    ar: 'نعم، موعدك مسجل.\n\nالتاريخ: {slot}\nالموضوع: {title}\nالحالة: {status}',
    ru: 'Да, ваша запись есть в системе.\n\nДата: {slot}\nТема: {title}\nСтатус: {status}',
    fr: 'Oui, votre rendez-vous est enregistré.\n\nDate : {slot}\nSujet : {title}\nStatut : {status}',
    es: 'Sí, su cita está registrada.\n\nFecha: {slot}\nTema: {title}\nEstado: {status}',
  },
  appointment_status_not_found: {
    tr: 'Sistemde henüz onaylı bir randevu kaydınız görünmüyor. Randevu oluşturmak isterseniz ad soyad, telefon, konu ve tarih/saat bilgilerinizi paylaşabilirsiniz.',
    en: 'I don’t see a confirmed appointment on file yet. To book one, share your name, phone, subject, and preferred date/time.',
    de: 'Ich finde noch keinen bestätigten Termin. Senden Sie für eine Buchung Name, Telefon, Thema und Wunschtermin.',
    ar: 'لا يوجد موعد مؤكد مسجل بعد. لإنشاء موعد، أرسل الاسم والهاتف والموضوع والتاريخ والوقت.',
    ru: 'Подтверждённой записи пока нет. Для записи отправьте имя, телефон, тему и желаемые дату и время.',
    fr: 'Aucun rendez-vous confirmé n’apparaît pour l’instant. Pour en créer un, envoyez nom, téléphone, sujet et date/heure.',
    es: 'Aún no hay una cita confirmada registrada. Para reservar, envíe nombre, teléfono, motivo y fecha/hora.',
  },
  appointment_field_name: {
    tr: 'Ad Soyad', en: 'Full Name', de: 'Vor- und Nachname', ar: 'الاسم الكامل', ru: 'Имя и фамилия', fr: 'Nom complet', es: 'Nombre completo',
  },
  appointment_field_phone: {
    tr: 'Telefon Numarası', en: 'Phone Number', de: 'Telefonnummer', ar: 'رقم الهاتف', ru: 'Телефон', fr: 'Téléphone', es: 'Teléfono',
  },
  appointment_field_subject: {
    tr: 'Randevu Konusu', en: 'Appointment Subject', de: 'Termingrund', ar: 'موضوع الموعد', ru: 'Тема визита', fr: 'Objet du rendez-vous', es: 'Motivo de la cita',
  },
  appointment_field_datetime: {
    tr: 'İstenen Tarih ve Saat', en: 'Desired Date and Time', de: 'Gewünschtes Datum und Uhrzeit', ar: 'التاريخ والوقت المطلوب', ru: 'Желаемая дата и время', fr: 'Date et heure souhaitées', es: 'Fecha y hora deseadas',
  },
  appointment_datetime_required: {
    tr: 'Randevu için istediğiniz tarih ve saati yazar mısınız? (ör. "15 temmuz saat 14:00" veya "pazartesi saat 10")',
    en: 'Please share your desired appointment date and time (e.g. "July 15 at 2:00 PM" or "Monday at 10").',
    de: 'Bitte nennen Sie gewünschtes Datum und Uhrzeit (z. B. „15. Juli um 14:00“).',
    ar: 'يرجى كتابة التاريخ والوقت المطلوبين للموعد.',
    ru: 'Укажите желаемую дату и время записи.',
    fr: 'Indiquez la date et l\'heure souhaitées pour le rendez-vous.',
    es: 'Indique la fecha y hora deseadas para la cita.',
  },
  appointment_slot_occupied: {
    tr: 'Maalesef istediğiniz tarih ve saat dolu.\n\nLütfen başka bir tarih ve saat gönderin.',
    en: 'Unfortunately, your requested date and time are already booked.\n\nPlease send another date and time.',
    de: 'Leider ist Ihr gewünschter Termin bereits belegt.\n\nBitte senden Sie ein anderes Datum und eine andere Uhrzeit.',
    ar: 'للأسف، التاريخ والوقت المطلوبان محجوزان.\n\nيرجى إرسال تاريخ ووقت آخرين.',
    ru: 'К сожалению, выбранные дата и время уже заняты.\n\nПожалуйста, укажите другие дату и время.',
    fr: 'Malheureusement, la date et l\'heure demandées sont déjà prises.\n\nVeuillez proposer une autre date et heure.',
    es: 'Lamentablemente, la fecha y hora solicitadas ya están reservadas.\n\nEnvíe otra fecha y hora.',
  },
  appointment_db_unavailable: {
    tr: 'Şu anda randevu takvimine erişemiyorum.\n\nYanlış bilgi vermemek için müsaitliği doğrulayamıyorum. Lütfen kısa süre sonra tekrar deneyin.',
    en: 'I cannot access the appointment calendar right now.\n\nTo avoid giving incorrect information, I cannot verify appointment availability. Please try again shortly.',
    de: 'Der Terminkalender ist derzeit nicht erreichbar.\n\nUm falsche Angaben zu vermeiden, kann ich die Verfügbarkeit nicht prüfen. Bitte versuchen Sie es später erneut.',
    ar: 'لا يمكنني الوصول إلى تقويم المواعيد حالياً.\n\nلتجنب معلومات خاطئة، لا أستطيع التحقق من التوفر. يرجى المحاولة لاحقاً.',
    ru: 'Сейчас нет доступа к календарю записей.\n\nЧтобы не дать неверную информацию, я не могу проверить доступность. Попробуйте позже.',
    fr: 'Je ne peux pas accéder au calendrier des rendez-vous pour le moment.\n\nPour éviter toute erreur, je ne peux pas vérifier les disponibilités. Réessayez bientôt.',
    es: 'No puedo acceder al calendario de citas en este momento.\n\nPara no dar información incorrecta, no puedo verificar disponibilidad. Inténtelo de nuevo pronto.',
  },
  appointment_create_system_error: {
    tr: 'Randevunuz sistem hatası nedeniyle oluşturulamadı.\n\nLütfen tekrar deneyin.',
    en: 'Your appointment could not be created due to a system error.\n\nPlease try again.',
    de: 'Ihr Termin konnte aufgrund eines Systemfehlers nicht erstellt werden.\n\nBitte versuchen Sie es erneut.',
    ar: 'تعذر إنشاء موعدك بسبب خطأ في النظام.\n\nيرجى المحاولة مرة أخرى.',
    ru: 'Запись не удалось создать из-за системной ошибки.\n\nПопробуйте снова.',
    fr: 'Votre rendez-vous n\'a pas pu être créé en raison d\'une erreur système.\n\nVeuillez réessayer.',
    es: 'No se pudo crear su cita por un error del sistema.\n\nInténtelo de nuevo.',
  },
  appointment_date_needed_for_availability: {
    tr: 'Müsait saatleri gösterebilmem için lütfen bir tarih belirtin.',
    en: 'Please specify a date so I can show available times.',
    de: 'Bitte nennen Sie ein Datum, damit ich freie Zeiten anzeigen kann.',
    ar: 'يرجى تحديد تاريخ لعرض الأوقات المتاحة.',
    ru: 'Укажите дату, чтобы я мог показать свободное время.',
    fr: 'Indiquez une date pour afficher les créneaux disponibles.',
    es: 'Indique una fecha para mostrar horarios disponibles.',
  },
  appointment_available_slots: {
    tr: 'Müsait saatler:\n{slots}',
    en: 'Available times:\n{slots}',
    de: 'Verfügbare Zeiten:\n{slots}',
    ar: 'الأوقات المتاحة:\n{slots}',
    ru: 'Свободное время:\n{slots}',
    fr: 'Créneaux disponibles :\n{slots}',
    es: 'Horarios disponibles:\n{slots}',
  },
  appointment_available_for_date: {
    tr: '{date} tarihi için müsait saatler:\n{slots}',
    en: 'Available times for {date}:\n{slots}',
    de: 'Verfügbare Zeiten am {date}:\n{slots}',
    ar: 'الأوقات المتاحة في {date}:\n{slots}',
    ru: 'Свободное время на {date}:\n{slots}',
    fr: 'Créneaux disponibles le {date} :\n{slots}',
    es: 'Horarios disponibles para {date}:\n{slots}',
  },
  appointment_no_available_slots: {
    tr: 'Bu tarihte müsait saat bulunmuyor.',
    en: 'No available times on this date.',
    de: 'An diesem Datum sind keine Zeiten frei.',
    ar: 'لا توجد أوقات متاحة في هذا التاريخ.',
    ru: 'На эту дату нет свободного времени.',
    fr: 'Aucun créneau disponible à cette date.',
    es: 'No hay horarios disponibles en esta fecha.',
  },
  kb_miss_instruction: {
    tr: 'Bu soru için bilgi bankasında eşleşen içerik bulunamadı. Bunu müşteriye belirt; bilgin yoksa canlı temsilciye aktarmayı teklif et.',
    en: 'No matching knowledge base content was found for this question. State that clearly; offer live agent handoff if you cannot answer.',
    de: 'Kein passender Wissensdatenbank-Inhalt gefunden. Teilen Sie das mit; bieten Sie Live-Support an, wenn nötig.',
    ar: 'لم يُعثر على محتوى مطابق في قاعدة المعرفة. أوضح ذلك للعميل واعرض التحويل إلى ممثل إذا لزم.',
    ru: 'В базе знаний нет подходящего ответа. Сообщите об этом клиенту; предложите перевод к оператору.',
    fr: 'Aucun contenu correspondant dans la base de connaissances. Indiquez-le clairement et proposez un conseiller.',
    es: 'No hay contenido coincidente en la base de conocimientos. Indíquelo y ofrezca un agente en vivo si hace falta.',
  },
  kb_topics_header: {
    tr: 'Mevcut konular:',
    en: 'Available topics:',
    de: 'Verfügbare Themen:',
    ar: 'المواضيع المتاحة:',
    ru: 'Доступные темы:',
    fr: 'Sujets disponibles :',
    es: 'Temas disponibles:',
  },
  history_photo: {
    tr: '[Fotoğraf]',
    en: '[Photo]',
    de: '[Foto]',
    ar: '[صورة]',
    ru: '[Фото]',
    fr: '[Photo]',
    es: '[Foto]',
  },
  history_photo_caption: {
    tr: '[Fotoğraf] {caption}',
    en: '[Photo] {caption}',
    de: '[Foto] {caption}',
    ar: '[صورة] {caption}',
    ru: '[Фото] {caption}',
    fr: '[Photo] {caption}',
    es: '[Foto] {caption}',
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

/** Randevu onayında gösterilecek personel/sağlayıcı etiketi */
export function getAppointmentProviderLabel(
  lang: ConversationLang,
  custom?: string,
  category?: string | null
): string {
  if (custom?.trim()) return custom.trim();
  if (category && shouldAskAppointmentProvider(category)) {
    const label = getAppointmentProviderLabelForCategory(lang, category);
    if (label) return label;
  }
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
