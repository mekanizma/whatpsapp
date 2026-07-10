import { useEffect } from 'react';
import { getSiteUrl, SITE_BRAND } from '@/lib/site';
import type { PageSeoConfig } from './seo-config';
import { buildCanonicalUrl, buildGeoMetaContent } from './seo-config';
import { buildJsonLdScriptContent } from './geo-schema';

const SEO_ATTR = 'data-waai-seo';

function upsertMeta(
  key: string,
  content: string,
  attr: 'name' | 'property' = 'name'
): void {
  const selector = `meta[${attr}="${key}"][${SEO_ATTR}]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute(SEO_ATTR, 'true');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  const selector = `link[rel="${rel}"][${SEO_ATTR}]`;
  let el = document.head.querySelector(selector) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute(SEO_ATTR, 'true');
    document.head.appendChild(el);
  }
  el.href = href;
}

function upsertJsonLd(id: string, json: string): void {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    el.setAttribute(SEO_ATTR, 'true');
    document.head.appendChild(el);
  }
  el.textContent = json;
}

interface SeoHeadProps {
  config: PageSeoConfig;
  language: string;
}

export function SeoHead({ config, language }: SeoHeadProps) {
  useEffect(() => {
    const siteUrl = getSiteUrl();
    const canonical = buildCanonicalUrl(config.canonicalPath);
    const ogImage = `${siteUrl}${SITE_BRAND.ogImagePath}`;
    const geo = buildGeoMetaContent();
    const isEn = language.startsWith('en');
    const ogLocale = isEn ? 'en_GB' : 'tr_TR';

    document.title = config.title;
    document.documentElement.lang = isEn ? 'en' : 'tr';

    upsertMeta('description', config.description);
    if (config.keywords) {
      upsertMeta('keywords', config.keywords);
    }
    upsertMeta('robots', config.robots || 'index, follow, max-image-preview:large');
    upsertMeta('author', SITE_BRAND.legalName);
    upsertMeta('geo.region', geo.region);
    upsertMeta('geo.placename', geo.placename);
    upsertMeta('geo.position', geo.position);
    upsertMeta('ICBM', geo.icbm);

    upsertMeta('og:title', config.title, 'property');
    upsertMeta('og:description', config.description, 'property');
    upsertMeta('og:type', config.ogType || 'website', 'property');
    upsertMeta('og:url', canonical, 'property');
    upsertMeta('og:site_name', SITE_BRAND.productName, 'property');
    upsertMeta('og:locale', ogLocale, 'property');
    upsertMeta('og:image', ogImage, 'property');
    upsertMeta('og:image:alt', SITE_BRAND.productName, 'property');

    upsertMeta('twitter:card', 'summary_large_image');
    upsertMeta('twitter:title', config.title);
    upsertMeta('twitter:description', config.description);
    upsertMeta('twitter:image', ogImage);

    upsertLink('canonical', canonical);

    if (config.robots?.includes('noindex')) {
      document.getElementById('waai-jsonld')?.remove();
    } else {
      upsertJsonLd('waai-jsonld', buildJsonLdScriptContent(config, language));
    }

    return () => {
      /* Route değişiminde bir sonraki effect günceller */
    };
  }, [config, language]);

  return null;
}
