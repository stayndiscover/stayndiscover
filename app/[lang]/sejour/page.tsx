import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AccountNav } from '@/components/AccountNav';
import { DestImg } from '@/components/DestImg';
import { getMe } from '@/lib/auth';
import { getDestinations } from '@/lib/catalog';
import { listTrips, type TripRow } from '@/lib/trips';
import { fDate, isLang, translator, tr, type Lang } from '@/lib/i18n';
import { pageMeta } from '@/lib/seo';
import { t as tt } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  return pageMeta({ lang, path: '/sejour', title: tt(lang, 'navPlan'), description: tt(lang, 'planText').slice(0, 155) });
}

/** « Planifier mon séjour » : présentation pour les visiteurs, liste des séjours pour les voyageurs connectés. */
export default async function Sejour({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const sp = await searchParams;
  if (sp.nouveau) redirect(`/${lang}/sejour/nouveau${sp.dest ? `?dest=${encodeURIComponent(sp.dest)}` : ''}`);
  const me = await getMe();
  const dests = await getDestinations();

  if (!me) {
    return (
      <div className="wrap" style={{ padding: '40px 20px' }}>
        <div className="plan-band">
          <div className="stack" style={{ gap: 16 }}>
            <span className="eyebrow" style={{ color: 'var(--sun)' }}>{t('navPlan')}</span><h1 style={{ fontSize: '2rem' }}>{t('planTitle')}</h1>
            <p className="muted">{t('planText')}</p>
            <ol className="muted small" style={{ margin: 0, paddingLeft: 18 }}>{t('planSteps').split('|').map((x) => <li key={x}>{x}</li>)}</ol>
            <div className="row">
              <Link className="btn sun" href={`/${lang}/sejour/nouveau`}>{t('planBtn')}</Link>
              <Link className="btn ghost" style={{ color: '#fff' }} href={`/${lang}/connexion?next=${encodeURIComponent(`/${lang}/sejour`)}`}>{t('login')}</Link>
            </div>
          </div>
          <div className="mini-plan"><span className="small" style={{ color: '#b9c9c6' }}>{t('needAccountText')}</span></div>
        </div>
      </div>
    );
  }

  const trips = await listTrips(me.id);
  const active = trips.filter((x) => !x.archived_at);
  const archived = trips.filter((x) => x.archived_at);
  const destMap = new Map(dests.map((d) => [d.slug, d]));
  const card = (s: TripRow) => (
    <article key={s.id} className="card">
      <div className="pic">{destMap.get(s.dest_slug) && <DestImg d={destMap.get(s.dest_slug)!} lang={lang} />}
        <Link className="cover" href={`/${lang}/sejour/${s.id}`} aria-label={s.title || tr(s.dest_name, lang)} /></div>
      <div className="body">
        <h3><Link href={`/${lang}/sejour/${s.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{s.title || tr(s.dest_name, lang)}</Link></h3>
        <p className="small">{fDate(s.start_date, lang, { day: 'numeric', month: 'short', year: 'numeric' })} → {fDate(s.end_date, lang, { day: 'numeric', month: 'short', year: 'numeric' })} · {s.nights} {t('nightsS')}</p>
        <p className="small muted">{s.adults + s.children} {t('travelersS')} · {s.n_items} {t('activities')}</p>
        <div className="foot"><Link className="btn sm" href={`/${lang}/sejour/${s.id}`}>{t('monSejour')}</Link></div>
      </div>
    </article>
  );

  return (
    <div className="wrap acct-layout">
      <AccountNav lang={lang} active="sejour" />
      <div className="stack" style={{ gap: 24 }}>
        <div className="row between">
          <div className="stack" style={{ gap: 4 }}><span className="eyebrow">{t('navPlan')}</span><h1 style={{ fontSize: '2rem' }}>{t('myTrips')}</h1></div>
          <Link className="btn sun" href={`/${lang}/sejour/nouveau`}>＋ {t('newStay')}</Link>
        </div>
        {active.length ? <div className="grid g3">{active.map(card)}</div> : (
          <div className="empty-state panel"><p className="muted">{t('noStay')}</p><Link className="btn sun" href={`/${lang}/sejour/nouveau`}>{t('planBtn')}</Link></div>
        )}
        {archived.length > 0 && (
          <details className="stack"><summary className="small muted" style={{ cursor: 'pointer', fontWeight: 600 }}>{t('archived')} ({archived.length})</summary>
            <div className="grid g3" style={{ marginTop: 12, opacity: 0.8 }}>{archived.map(card)}</div></details>
        )}
      </div>
    </div>
  );
}
