import { notFound } from 'next/navigation';
import { siteContent } from '@/lib/catalog';
import { isLang, translator, type Lang } from '@/lib/i18n';
import { clip, pageMeta } from '@/lib/seo';

const PAGES: Record<string, string> = { cgv: 'cgv', mentions: 'mentions', confidentialite: 'privacy' };

export async function generateMetadata({ params }: { params: Promise<{ lang: string; page: string }> }) {
  const { lang: l, page } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  if (!PAGES[page]) return {};
  const c = await siteContent(`page.${page}`);
  const title = c?.value?.[lang]?.title || translator(lang)(PAGES[page]);
  const body = c?.value?.[lang]?.body || c?.value?.fr?.body;
  return pageMeta({ lang, path: `/informations/${page}`, title, description: clip(body || `${title} · StayNdiscover. ${translator(lang)('footAbout')}`) });
}

/** Pages légales : le texte vient de la table site_content (clé page.cgv, page.mentions, page.confidentialite), modifiable par l'admin. */
export default async function Info({ params }: { params: Promise<{ lang: string; page: string }> }) {
  const { lang: l, page } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  if (!PAGES[page]) notFound();
  const c = await siteContent(`page.${page}`);
  const body = c?.value?.[lang]?.body || c?.value?.fr?.body;
  return (
    <div className="wrap" style={{ padding: '36px 20px 60px' }}>
      <div className="doc stack">
        <span className="eyebrow">{t('legalTitle')}</span>
        <h1 style={{ fontSize: '2rem' }}>{c?.value?.[lang]?.title || t(PAGES[page])}</h1>
        {body ? body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>) : <p className="muted">{t('legalTxt')}</p>}
      </div>
    </div>
  );
}
