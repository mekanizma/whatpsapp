import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resolvePageSeo } from './seo-config';
import { SeoHead } from './SeoHead';

/** Rota bazlı SEO — görünür sayfa metni eklemez, yalnızca head etiketlerini günceller */
export function RouteSeo() {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const config = resolvePageSeo(pathname, i18n.language);

  return <SeoHead config={config} language={i18n.language} />;
}
