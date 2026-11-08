import { redirect } from 'next/navigation';
import { TripWizard } from '@/components/TripWizard';
import { destImgUrl } from '@/components/DestImg';
import { getMe } from '@/lib/auth';
import { getDestinations } from '@/lib/catalog';
import { accommodationOptions, wizardValues } from '@/lib/trips';
import { isLang, translator, tr, type Lang } from '@/lib/i18n';
import { privateMeta } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  return privateMeta(lang, '/sejour/nouveau', translator(lang)('wzTitle'));
}
const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** Étape 1 du planificateur : le questionnaire de création du séjour (§ 4 du cahier des charges). */
export default async function NouveauSejour({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const sp = await searchParams;
  const me = await getMe();
  const here = `/${lang}/sejour/nouveau${sp.dest ? `?dest=${encodeURIComponent(sp.dest)}` : ''}`;
  if (!me) redirect(`/${lang}/connexion?mode=signup&next=${encodeURIComponent(here)}`);
  const [dests, accs] = await Promise.all([getDestinations(), accommodationOptions(me.id)]);
  const dest = dests.some((d) => d.slug === sp.dest) ? sp.dest! : '';
  return (
    <div className="wrap" style={{ maxWidth: 900, padding: '28px 20px 60px' }}>
      <div className="stack" style={{ gap: 6, marginBottom: 18 }}>
        <span className="eyebrow">{t('navPlan')}</span>
        <h1 style={{ fontSize: '2rem' }}>{t('wzTitle')}</h1>
        <p className="muted">{t('wzIntro')}</p>
      </div>
      <TripWizard lang={lang} initial={wizardValues(null, { dest, start: plus(30), end: plus(37) })}
        dests={dests.map((d) => ({ slug: d.slug, name: tr(d.name, lang), img: destImgUrl(d) }))}
        accs={accs.map((a) => ({ id: a.id, dest: a.dest, name: tr(a.title, lang) }))} />
    </div>
  );
}
