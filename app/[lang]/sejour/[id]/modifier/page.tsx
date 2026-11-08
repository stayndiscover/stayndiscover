import { notFound } from 'next/navigation';
import { TripWizard } from '@/components/TripWizard';
import { destImgUrl } from '@/components/DestImg';
import { requireMe } from '@/lib/auth';
import { getDestinations } from '@/lib/catalog';
import { accommodationOptions, getTrip, wizardValues } from '@/lib/trips';
import { isLang, translator, tr, type Lang } from '@/lib/i18n';
import { privateMeta } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang: l, id } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  return privateMeta(lang, `/sejour/${id}/modifier`, translator(lang)('wzEditTitle'));
}

/** Modification du séjour : le même questionnaire, prérempli (§ 4.7 « revenir compléter ultérieurement »). */
export default async function ModifierSejour({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang: l, id } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const me = await requireMe(lang, `/${lang}/sejour/${id}/modifier`);
  const trip = /^[0-9a-f-]{36}$/.test(id) ? await getTrip(me.id, id) : null;
  if (!trip) notFound();
  const [dests, accs] = await Promise.all([getDestinations(), accommodationOptions(me.id)]);
  return (
    <div className="wrap" style={{ maxWidth: 900, padding: '28px 20px 60px' }}>
      <div className="stack" style={{ gap: 6, marginBottom: 18 }}>
        <span className="eyebrow">{t('monSejour')}</span>
        <h1 style={{ fontSize: '2rem' }}>{t('wzEditTitle')}</h1>
      </div>
      <TripWizard lang={lang} initial={wizardValues(trip, { dest: '', start: '', end: '' })}
        dests={dests.map((d) => ({ slug: d.slug, name: tr(d.name, lang), img: destImgUrl(d) }))}
        accs={accs.map((a) => ({ id: a.id, dest: a.dest, name: tr(a.title, lang) }))} />
    </div>
  );
}
