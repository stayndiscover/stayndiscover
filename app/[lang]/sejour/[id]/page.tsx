import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccountNav } from '@/components/AccountNav';
import { Card, Pic, listingHref } from '@/components/Card';
import { MapView } from '@/components/MapView';
import { PaywallSlot, plannerStatus } from '@/components/PaywallSlot';
import { requireMe } from '@/lib/auth';
import { searchCards, gmaps, type Card as CardT } from '@/lib/catalog';
import { withDb, rows } from '@/lib/db';
import { PREFS } from '@/lib/dict-planner';
import { fDate, isLang, money, translator, tr, type Lang } from '@/lib/i18n';
import { privateMeta } from '@/lib/seo';
import { getTrip } from '@/lib/trips';
import { planVoyage, setTripArchived, toggleTripFavorite } from '@/app/actions';
import { TripHeart } from '@/components/TripHeart';

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: P) {
  const { lang: l, id } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  return privateMeta(lang, `/sejour/${id}`, translator(lang)('monSejour'));
}

/** Espace « Mon séjour » (§ 3.4, 10 et 14 du cahier des charges du planificateur). */
export default async function MonSejour({ params, searchParams }: P) {
  const { lang: l, id } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const sp = await searchParams;
  const me = await requireMe(lang, `/${lang}/sejour/${id}`);
  const trip = /^[0-9a-f-]{36}$/.test(id) ? await getTrip(me.id, id) : null;
  if (!trip) notFound();
  const L = { fr: 0, en: 1, es: 2 }[lang];
  const path = `/${lang}/sejour/${trip.id}`;
  const travellers = trip.adults + trip.children;

  const [itemIds, favIds, bookingsN, status] = await Promise.all([
    withDb(me.id, (db) => rows<{ listing_id: string }>(db, 'select listing_id from public.trip_items where trip_id = $1 order by sort_order, created_at', [trip.id])),
    withDb(me.id, (db) => rows<{ listing_id: string }>(db, 'select listing_id from public.favorites where user_id = $1', [me.id])),
    withDb(me.id, (db) => rows<{ n: number }>(db, `select count(*)::int as n from public.bookings b join public.listings l on l.id = b.listing_id
      join public.trips t on t.destination_id = l.destination_id where b.user_id = $1 and t.id = $2 and b.status in ('confirmed', 'hold')`, [me.id, trip.id])),
    plannerStatus(me.id, trip.id),
  ]);
  const inTrip = new Set(itemIds.map((r) => r.listing_id));
  const favSet = new Set(favIds.map((r) => r.listing_id));
  const destCards = await searchCards({ dest: trip.dest_slug });
  const byId = new Map(destCards.map((c) => [c.id, c]));
  const selection = [
    ...destCards.filter((c) => c.type === 'hebergement' && favSet.has(c.id)),
    ...itemIds.map((r) => byId.get(r.listing_id)).filter((c): c is CardT => !!c),
  ];
  const isSelected = (c: CardT) => (c.type === 'hebergement' ? favSet.has(c.id) : inTrip.has(c.id));

  // Hébergements libres sur TOUTES les nuits du séjour et assez grands pour le groupe (vérification réelle, § 5.4)
  const accIds = destCards.filter((c) => c.type === 'hebergement').map((c) => c.id);
  const freeAccIds = accIds.length ? new Set((await withDb(null, (db) => rows<{ listing_id: string }>(db, `select distinct u.listing_id from public.accommodation_units u
      where u.listing_id = any($1::uuid[]) and u.is_active and u.max_guests >= $4 and u.min_nights <= ($3::date - $2::date)
        and not exists (select 1 from public.get_unit_busy_nights(u.id, $2::date, $3::date))`, [accIds, trip.start_date, trip.end_date, travellers]))).map((r) => r.listing_id)) : new Set<string>();

  // Catalogue de la destination en 3 onglets (demande de Marion) : hébergements, excursions payantes,
  // puis lieux à découvrir sans réservation en ligne (plages, spots photo, restaurants…)
  const wanted = new Set(PREFS.filter((p) => trip.preference_keys.includes(p.key)).flatMap((p) => p.cats));
  const TABS = ['hebergement', 'excursion', 'lieu'] as const;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as (typeof TABS)[number]) : 'hebergement';
  const inTab = destCards.filter((c) => c.type === tab);
  const subChips = [...new Map(inTab.map((c) => [c.cat_slug, tr(c.cat_name, lang)])).entries()].map(([key, label]) => ({ key, label }));
  const sub = subChips.some((x) => x.key === sp.cat) ? sp.cat! : '';
  const catalogue = inTab.filter((c) => !sub || c.cat_slug === sub).sort((x, y) =>
    tab === 'hebergement' ? Number(freeAccIds.has(y.id)) - Number(freeAccIds.has(x.id))
      : Number(wanted.has(y.cat_slug)) - Number(wanted.has(x.cat_slug)));
  const tabHref = (tb: string, c = '') => `${path}?tab=${tb}${c ? `&cat=${c}` : ''}#catalogue`;
  const datesQs = `in=${trip.start_date}&out=${trip.end_date}&tr=${travellers}`;
  const dateL = (d: string) => fDate(d, lang, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

  const fact = (k: string, v: React.ReactNode) => <div className="fact" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>;
  const accLabel = trip.accommodation_mode === 'staynd' && trip.acc_title ? tr(trip.acc_title, lang)
    : trip.accommodation_mode === 'elsewhere' ? `${trip.ext_acc_name} · ${trip.ext_acc_address}`
      : t(trip.accommodation_mode === 'find' ? 'accFind' : 'accUndecided');
  const prog = [
    { k: t('monSejour'), s: `${trip.nights} ${t('nightsS')}`, href: '#infos', done: true },
    { k: t('progMesRecherches'), s: tr(trip.dest_name, lang), href: '#catalogue', done: false },
    { k: t('progFavoris'), s: `${selection.length} ${t('elements')}`, href: '#selection', done: selection.length > 0 },
    { k: t('progPlanning'), s: status?.unlocked ? t('unlockedBadge') : money(status?.price ?? 19.99, lang), href: '#planning', done: false },
    { k: t('progResas'), s: String(bookingsN[0]?.n ?? 0), href: `/${lang}/compte`, done: (bookingsN[0]?.n ?? 0) > 0 },
    { k: t('progCarnet'), s: t('soon'), href: null, done: false },
  ];

  return (
    <div className="wrap acct-layout">
      <PaywallSlot lang={lang} basePath={path} sp={{ ...sp, sejour: sp.sejour ?? trip.id }} />
      <AccountNav lang={lang} active="sejour" />
      <div className="stack" style={{ gap: 26 }}>
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">{t('monSejour')}{trip.archived_at && ` · ${t('archived')}`}</span>
            <h1 style={{ fontSize: '2rem' }}>{trip.title || tr(trip.dest_name, lang)}</h1>
            <p className="muted">{tr(trip.dest_name, lang)} · {dateL(trip.start_date)} → {dateL(trip.end_date)} · {t('nightsN', trip.nights, trip.nights + 1)} · {t('totalTravellers', travellers)}</p>
          </div>
          <div className="row">
            <Link className="btn ghost sm" href={`${path}/modifier`}>{t('edit')}</Link>
            <form action={setTripArchived}>
              <input type="hidden" name="lang" value={lang} /><input type="hidden" name="trip" value={trip.id} />
              <input type="hidden" name="archived" value={trip.archived_at ? '0' : '1'} />
              <button className="btn ghost sm">{trip.archived_at ? t('unarchive') : t('archive')}</button>
            </form>
          </div>
        </div>
        {sp.nouveau && <div className="notice ok" role="status">{t('tripCreated')}</div>}
        {sp.modifie && <div className="notice ok" role="status">{t('tripUpdated')}</div>}

        <ol className="prog" aria-label={t('monSejour')}>
          {prog.map((x) => (
            <li key={x.k} className={x.done ? 'done' : x.href ? '' : 'soon'}>
              {x.href ? <Link href={x.href}><span className="k">{x.done ? '✓ ' : ''}{x.k}</span><span className="s">{x.s}</span></Link>
                : <span className="p"><span className="k">{x.k}</span><span className="s">{x.s}</span></span>}
            </li>
          ))}
        </ol>

        <section id="planning" className="plan-cta">
          <div>
            <h2 style={{ fontSize: '1.3rem', color: '#fff' }}>{t('planVoyage')}</h2>
            <p className="small">{t('planVoyageHelp')}</p>
            {status && !status.unlocked && <p className="small" style={{ color: 'var(--sun)' }}>{t('trialBadge', Math.min(status.used, status.free_items), status.free_items)}</p>}
          </div>
          <form action={planVoyage}>
            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="trip" value={trip.id} />
            <button className="btn sun">{t('planVoyage')}{status && !status.unlocked ? ` · ${money(status.price, lang)}` : ''}</button>
          </form>
        </section>
        {sp.planning === 'bientot' && <div className="notice info" role="status">{t('planEngineSoon')}</div>}

        <section id="infos" className="panel stack">
          <div className="row between"><h2 style={{ fontSize: '1.3rem' }}>{t('generalInfo')}</h2><Link className="small" href={`${path}/modifier`}>{t('edit')}</Link></div>
          <div className="facts">
            {fact(t('stDates'), `${dateL(trip.start_date)} → ${dateL(trip.end_date)}`)}
            {fact(t('arrTime'), trip.arrival_time ?? t('notSet'))}
            {fact(t('depTime'), trip.departure_time ?? t('notSet'))}
            {fact(t('accommodationL'), accLabel)}
            {fact(t('stTravellers'), `${trip.adults} ${t('adultsShort')}${trip.children ? `, ${trip.children} ${t('childrenShort')} (${trip.children_ages.map((a) => t('years', a)).join(', ')})` : ''}`)}
            {fact(t('paceQ'), `${t({ calm: 'paceCalm', balanced: 'paceEq', intense: 'paceInt' }[trip.pace] ?? 'paceEq')} · ${trip.activity_start}–${trip.activity_end}`)}
            {fact(t('freeTimeL'), trip.free_time_min ? `${trip.free_time_min} min` : t('noneMin'))}
            {fact(t('budget'), trip.budget ? `${money(trip.budget, lang)} ${t(trip.budget_scope === 'person' ? 'budgetPerson' : 'budgetGroup')}` : t('notSet'))}
            {trip.regions.length > 0 && fact(t('regionsL'), trip.regions.join(', '))}
            {trip.transport_info && fact(t('transportL'), trip.transport_info)}
          </div>
          {trip.preference_keys.length > 0 && (
            <div className="chips">{PREFS.filter((p) => trip.preference_keys.includes(p.key)).map((p) => <span key={p.key} className="chip on">{p.label[L]}</span>)}</div>
          )}
        </section>

        {trip.accommodation_mode === 'elsewhere' && (
          <section className="panel row between">
            <div className="stack" style={{ gap: 2 }}><b>{trip.ext_acc_name}</b><span className="small muted">{trip.ext_acc_address}
              {trip.ext_check_in && ` · ${t('checkIn')} ${trip.ext_check_in}`}{trip.ext_check_out && ` · ${t('checkOut')} ${trip.ext_check_out}`}</span></div>
            <a className="btn ghost sm" target="_blank" rel="noopener noreferrer"
              href={gmaps({ lat: trip.ext_acc_lat, lng: trip.ext_acc_lng, address: trip.ext_acc_address })}>{t('openGmaps')}</a>
          </section>
        )}
        <section id="selection" className="panel stack">
          <div className="stack" style={{ gap: 2 }}><h2 style={{ fontSize: '1.3rem' }}>{t('progFavoris')} · {selection.length}</h2><p className="small muted">{t('selectionHelp')}</p></div>
          {selection.length ? (
            <div className="stack" style={{ gap: 8 }}>{selection.map((c) => (
              <div key={c.id} className="cart-line">
                <div className="thumb"><Pic c={c} lang={lang} /></div>
                <div className="stack" style={{ gap: 2 }}><Link href={listingHref(lang, c)} style={{ color: 'inherit', fontWeight: 700 }}>{tr(c.title, lang)}</Link>
                  <span className="small muted">{tr(c.cat_name, lang)}{c.booking_required && <> · <span className="pill sun">{t('bookReq')}</span></>}
                    {c.type === 'hebergement' && <> · <span className={`pill ${freeAccIds.has(c.id) ? 'ok' : 'bad'}`}>{freeAccIds.has(c.id) ? t('available') : t('unavailable')}</span></>}</span></div>
                <form action={toggleTripFavorite}>
                  <input type="hidden" name="lang" value={lang} /><input type="hidden" name="trip" value={trip.id} />
                  <input type="hidden" name="listing" value={c.id} /><input type="hidden" name="path" value={path} />
                  <button className="btn ghost sm">{t('remove')}</button>
                </form>
              </div>))}
            </div>
          ) : <p className="muted small">{t('pickBelow')}</p>}
          {selection.some((c) => c.lat != null) && <MapView label={t('mapTitle')} height={300}
            points={selection.filter((c) => c.lat != null).map((c, n) => ({ lat: c.lat!, lng: c.lng!, label: String(n + 1), title: tr(c.title, lang), href: listingHref(lang, c) }))} />}
        </section>

        <section id="catalogue" className="stack">
          <div className="stack" style={{ gap: 2 }}>
            <h2 style={{ fontSize: '1.3rem' }}>{t('discoverAll', tr(trip.dest_name, lang))}</h2>
            <p className="small muted">{t('heartHelp')}</p>
          </div>
          <div className="tabs3" role="tablist" aria-label={t('discoverAll', tr(trip.dest_name, lang))}>
            {TABS.map((tb, i) => (
              <Link key={tb} role="tab" aria-selected={tab === tb} scroll={false} className={tab === tb ? 'on' : ''} href={tabHref(tb)}>
                <span className="n">{i + 1}</span>
                <span className="stack" style={{ gap: 0 }}><b>{t(`tab_${tb}`)} ({destCards.filter((c) => c.type === tb).length})</b><span className="small">{t(`tab_${tb}_d`)}</span></span>
              </Link>
            ))}
          </div>
          {subChips.length > 1 && (
            <div className="chips" role="group" aria-label={t('category')}>
              <Link scroll={false} className={`chip ${!sub ? 'on' : ''}`} href={tabHref(tab)}>{t('all')}</Link>
              {subChips.map((x) => <Link key={x.key} scroll={false} className={`chip ${sub === x.key ? 'on' : ''}`} href={tabHref(tab, x.key)}>{x.label}</Link>)}
            </div>
          )}
          {catalogue.length ? (
            <div className="grid g4">{catalogue.map((c) => {
              const on = isSelected(c);
              return (
                <Card key={c.id} c={c} lang={lang} fav={on} path={path}
                  heart={<TripHeart lang={lang} trip={trip.id} listing={c.id} path={`${path}?tab=${tab}${sub ? `&cat=${sub}` : ''}`} on={on} label={on ? t('removeFav') : t('fav')} />}
                  extra={c.type === 'hebergement' ? (
                    <div className="row" style={{ gap: 6 }}>
                      <span className={`pill ${freeAccIds.has(c.id) ? 'ok' : 'bad'}`}>{freeAccIds.has(c.id) ? t('available') : t('unavailable')}</span>
                      <Link className="small" href={`${listingHref(lang, c)}?${datesQs}`}>{t('seeDates')}</Link>
                    </div>) : (on || wanted.has(c.cat_slug)) ? (
                    <div className="row" style={{ gap: 6 }}>
                      {on && <span className="pill ok">✓ {t('inThisTrip')}</span>}
                      {!on && wanted.has(c.cat_slug) && <span className="pill sun">{t('forYou')}</span>}
                    </div>) : null} />
              );
            })}</div>
          ) : <p className="muted small">{t('noResults')}</p>}
        </section>
      </div>
    </div>
  );
}
