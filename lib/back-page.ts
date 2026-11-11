import { isLang, translator, type Lang } from './i18n';
import { privateMeta } from './seo';

export type PageProps = { params: Promise<{ lang: string; id?: string }>; searchParams: Promise<Record<string, string | undefined>> };
export async function pageArgs(p: PageProps) {
  const { lang: l, id } = await p.params;
  const sp = await p.searchParams;
  const lang: Lang = isLang(l) ? l : 'fr';
  return { lang, id, sp, t: translator(lang) };
}
/** Métadonnées des pages privées (jamais indexées). */
export const backMeta = (path: string, key: string) => async ({ params }: { params: Promise<{ lang: string }> }) => {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  return privateMeta(lang, path, translator(lang)(key));
};
