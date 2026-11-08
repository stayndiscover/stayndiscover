import type { Lang } from './i18n';

// Libellé « pays · région » affiché sous le nom de la destination
const COUNTRY: Record<string, [string, string, string]> = {
  MQ: ['France · Caraïbes', 'France · Caribbean', 'Francia · Caribe'],
  BZ: ['Amérique centrale', 'Central America', 'Centroamérica'],
  MA: ['Afrique du Nord', 'North Africa', 'Norte de África'],
};
export const countryLabel = (code: string, lang: Lang) => {
  const known = COUNTRY[code];
  if (known) return known[{ fr: 0, en: 1, es: 2 }[lang]];
  try { return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code; } catch { return code; }
};

// « en Martinique », « au Belize », « au Maroc » (le français a besoin de la bonne préposition)
const FR_IN: Record<string, string> = { martinique: 'en Martinique', belize: 'au Belize', maroc: 'au Maroc' };
export const destIn = (slug: string, name: string, lang: Lang) => (lang === 'fr' ? FR_IN[slug] ?? `– ${name}` : name);
