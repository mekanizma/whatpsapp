import { getSiteUrl, SITE_BRAND, SITE_GEO } from '@/lib/site';
import type { PageSeoConfig } from './seo-config';
import { buildCanonicalUrl } from './seo-config';

function organizationSchema(siteUrl: string, isEn: boolean) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_BRAND.legalName,
    alternateName: SITE_BRAND.name,
    url: siteUrl,
    logo: `${siteUrl}${SITE_BRAND.ogImagePath}`,
    email: SITE_BRAND.email,
    telephone: SITE_BRAND.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE_GEO.streetAddress,
      addressLocality: SITE_GEO.locality,
      addressRegion: isEn ? SITE_GEO.countryNameEn : SITE_GEO.countryName,
      postalCode: SITE_GEO.postalCode,
      addressCountry: 'CY',
    },
    areaServed: SITE_GEO.areaServed.map((name) => ({
      '@type': 'AdministrativeArea',
      name,
    })),
  };
}

function localBusinessSchema(siteUrl: string, isEn: boolean) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: `${SITE_BRAND.name} — ${SITE_BRAND.productName}`,
    image: `${siteUrl}${SITE_BRAND.ogImagePath}`,
    url: siteUrl,
    email: SITE_BRAND.email,
    telephone: SITE_BRAND.phone,
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE_GEO.streetAddress,
      addressLocality: SITE_GEO.locality,
      addressRegion: isEn ? SITE_GEO.countryNameEn : SITE_GEO.countryName,
      postalCode: SITE_GEO.postalCode,
      addressCountry: 'CY',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: SITE_GEO.latitude,
      longitude: SITE_GEO.longitude,
    },
    areaServed: SITE_GEO.areaServed,
  };
}

function softwareApplicationSchema(siteUrl: string, isEn: boolean) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_BRAND.productName,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: siteUrl,
    offers: {
      '@type': 'Offer',
      url: `${siteUrl}/pricing`,
      priceCurrency: 'TRY',
      availability: 'https://schema.org/InStock',
    },
    provider: {
      '@type': 'Organization',
      name: SITE_BRAND.legalName,
      url: siteUrl,
    },
    description: isEn
      ? 'WhatsApp AI customer support SaaS for businesses in Northern Cyprus.'
      : 'Kuzey Kıbrıs işletmeleri için WhatsApp yapay zeka müşteri destek SaaS platformu.',
    areaServed: SITE_GEO.areaServed,
  };
}

function webSiteSchema(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_BRAND.productName,
    url: siteUrl,
    publisher: {
      '@type': 'Organization',
      name: SITE_BRAND.legalName,
    },
  };
}

export function buildJsonLdGraph(
  config: PageSeoConfig,
  language: string
): Record<string, unknown>[] {
  const siteUrl = getSiteUrl();
  const isEn = language.startsWith('en');
  const graph: Record<string, unknown>[] = [organizationSchema(siteUrl, isEn), webSiteSchema(siteUrl)];

  if (config.includeLocalBusinessSchema) {
    graph.push(localBusinessSchema(siteUrl, isEn));
  }
  if (config.includeSoftwareSchema) {
    graph.push(softwareApplicationSchema(siteUrl, isEn));
  }

  return graph;
}

export function buildJsonLdScriptContent(
  config: PageSeoConfig,
  language: string
): string {
  const graph = buildJsonLdGraph(config, language);
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
    url: buildCanonicalUrl(config.canonicalPath),
  });
}
