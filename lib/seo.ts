import type { Metadata } from 'next';
import { LANGS, type Lang } from './i18n';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const SITE_NAME = 'StayNdiscover';
export const OG_LOCALE: Record<Lang, string> = { fr: 'fr_FR', en: 'en_GB', es: 'es_ES' };

/** Adresse absolue d'une page dans une langue donnée. `path` commence par « / » (ou vide pour l'accueil). */
export const abs = (lang: Lang, path = '') => `${SITE_URL}/${lang}${path}`;

/** Une même page existe en FR / EN / ES : on l'indique à Google (hreflang) et on fixe l'adresse officielle (canonical). */
export function alternates(lang: Lang, path = ''): Metadata['alternates'] {
  return {
    canonical: abs(lang, path),
    languages: { ...Object.fromEntries(LANGS.map((l) => [l, abs(l, path)])), 'x-default': abs('fr', path) },
  };
}

/** Texte court pour les descriptions (Google en affiche ~155 caractères). */
export const clip = (s: string, n = 155) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n - 1)).replace(/[,;:.\s]+$/, '') + '…';
};

type PageMeta = { lang: Lang; path: string; title: string; description: string; image?: string | null; imageAlt?: string;
  absoluteTitle?: boolean; noindex?: boolean; type?: 'website' | 'article' };

/** Métadonnées complètes d'une page : titre, description, langues, partage Facebook/WhatsApp/LinkedIn et X. */
export function pageMeta(p: PageMeta): Metadata {
  const image = p.image ? (p.image.startsWith('http') ? p.image : SITE_URL + p.image) : `${SITE_URL}/images/martinique.jpg`;
  const title = p.absoluteTitle ? { absolute: p.title } : p.title;
  const ogTitle = p.absoluteTitle ? p.title : `${p.title} · ${SITE_NAME}`;
  return {
    title,
    description: p.description,
    alternates: p.noindex ? { canonical: abs(p.lang, p.path) } : alternates(p.lang, p.path),
    robots: p.noindex ? { index: false, follow: true } : { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
    openGraph: {
      type: p.type ?? 'website', siteName: SITE_NAME, url: abs(p.lang, p.path), title: ogTitle, description: p.description,
      locale: OG_LOCALE[p.lang], alternateLocale: LANGS.filter((l) => l !== p.lang).map((l) => OG_LOCALE[l]),
      images: [{ url: image, alt: p.imageAlt || p.title }],
    },
    twitter: { card: 'summary_large_image', title: ogTitle, description: p.description, images: [image] },
  };
}

/** Pages personnelles (compte, panier…) : jamais dans Google. */
export const privateMeta = (lang: Lang, path: string, title: string): Metadata => ({
  title, robots: { index: false, follow: false }, alternates: { canonical: abs(lang, path) },
});

/** Bloc de données structurées schema.org (lu par Google pour les résultats enrichis). */
export function jsonLd(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') };
}

export const breadcrumb = (items: { name: string; url: string }[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
});
