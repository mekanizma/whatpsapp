import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './locales/tr.json';
import en from './locales/en.json';

export const LANG_STORAGE_KEY = 'wa_lang';

const saved = localStorage.getItem(LANG_STORAGE_KEY);
const initialLang = saved === 'en' || saved === 'tr' ? saved : 'tr';

i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: initialLang,
  fallbackLng: 'tr',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(LANG_STORAGE_KEY, lng);
  document.documentElement.lang = lng;
});

document.documentElement.lang = initialLang;

export default i18n;
