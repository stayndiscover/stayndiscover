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
