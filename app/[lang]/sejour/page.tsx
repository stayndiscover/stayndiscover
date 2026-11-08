import Link from 'next/link';
import { AccountNav } from '@/components/AccountNav';
import { DestImg } from '@/components/DestImg';
import { TripForm } from '@/components/TripForm';
import { getMe } from '@/lib/auth';
import { getDestinations } from '@/lib/catalog';
import { withDb, rows } from '@/lib/db';
import { fDate, isLang, translator, tr, type I18n, type Lang } from '@/lib/i18n';
import { deleteTrip } from '@/app/actions';

import { privateMeta } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  return privateMeta(lang, '/sejour', translator(lang)('myStays'));
}
const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default async function Sejour({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const sp = await searchParams;
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
              <Link className="btn sun" href={`/${lang}/connexion?mode=signup&next=${encodeURIComponent(`/${lang}/sejour?nouveau=1${sp.dest ? `&dest=${sp.dest}` : ''}`)}`}>{t('signup')}</Link>
              <Link className="btn ghost" style={{ color: '#fff' }} href={`/${lang}/connexion?next=${encodeURIComponent(`/${lang}/sejour`)}`}>{t('login')}</Link>
            </div>
          </div>
          <div className="mini-plan"><span className="small" style={{ color: '#b9c9c6' }}>{t('needAccountText')}</span></div>
        </div>
      </div>
    );
  }

  const [trips, accs] = await withDb(me.id, async (db) => [
    await rows<{ id: string; dest_slug: string; dest_name: I18n; start_date: string; end_date: string; adults: number; children: number;
      acc: I18n | null; n_items: number }>(db,
      `select t.id, d.slug as dest_slug, d.name as dest_name, to_char(t.start_date, 'YYYY-MM-DD') as start_date, to_char(t.end_date, 'YYYY-MM-DD') as end_date,
              t.adults, t.children, a.title as acc, (select count(*)::int from public.trip_items i where i.trip_id = t.id) as n_items
         from public.trips t join public.destinations d on d.id = t.destination_id left join public.listings a on a.id = t.accommodation_id
        where t.user_id = $1 order by (t.end_date < current_date), t.start_date`, [me.id]),
    await rows<{ id: string; dest: string; title: I18n }>(db,
      `select l.id, d.slug as dest, l.title from public.listings l join public.destinations d on d.id = l.destination_id
        where l.type = 'hebergement' and l.status = 'published' order by (l.id in (select listing_id from public.favorites where user_id = $1)) desc, l.title->>'fr'`, [me.id]),
  ] as const);
  const destMap = new Map(dests.map((d) => [d.slug, d]));

  return (
    <div className="wrap acct-layout">
      <AccountNav lang={lang} active="sejour" />
      <div className="stack" style={{ gap: 24 }}>
        <div className="stack" style={{ gap: 4 }}><span className="eyebrow">{t('navPlan')}</span><h1 style={{ fontSize: '2rem' }}>{t('myStays')}</h1></div>
        {trips.length ? (
          <div className="grid g3">{trips.map((s) => (
            <article key={s.id} className="card">
              <div className="pic">{destMap.get(s.dest_slug) && <DestImg d={destMap.get(s.dest_slug)!} lang={lang} />}</div>
              <div className="body">
                <h3>{tr(s.dest_name, lang)}</h3>
                <p className="small">{fDate(s.start_date, lang, { day: 'numeric', month: 'short', year: 'numeric' })} → {fDate(s.end_date, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <p className="small muted">{s.adults + s.children} {t('travelersS')} · {s.acc ? tr(s.acc, lang) : t('noAccom')} · {s.n_items} {t('activities')}</p>
                <div className="foot">
                  <Link className="btn sm" href={`/${lang}/favoris?sejour=${s.id}`}>{t('openPlanner')}</Link>
                  <form action={deleteTrip}><input type="hidden" name="lang" value={lang} /><input type="hidden" name="trip" value={s.id} />
                    <button className="btn ghost sm">{t('delete')}</button></form>
                </div>
              </div>
            </article>))}
          </div>
        ) : <p className="muted">{t('noStay')}</p>}
        <TripForm lang={lang} initialDest={sp.dest ?? ''} defaults={{ start: plus(30), end: plus(37) }}
          dests={dests.map((d) => ({ slug: d.slug, name: tr(d.name, lang) }))}
          accs={accs.map((a) => ({ id: a.id, dest: a.dest, name: tr(a.title, lang) }))}
          l={Object.fromEntries(['newStay', 'destination', 'arrival', 'departure', 'arrTime', 'depTime', 'adults', 'children', 'accom', 'noAccomYet', 'actFrom',
            'actTo', 'pace', 'paceCalm', 'paceEq', 'paceInt', 'budget', 'prefs', 'prefsPh', 'createStay', 'createStayHint'].map((k) => [k, t(k)]))} />
      </div>
    </div>
  );
}
