import Link from 'next/link';
import { AccountNav } from '@/components/AccountNav';
import { Card, Pic, listingHref } from '@/components/Card';
import { MapView } from '@/components/MapView';
import { getMe } from '@/lib/auth';
import { searchCards } from '@/lib/catalog';
import { withDb, rows } from '@/lib/db';
import { fDate, isLang, translator, tr, type I18n, type Lang } from '@/lib/i18n';
import { toggleTripItem } from '@/app/actions';

import { privateMeta } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  return privateMeta(lang, '/favoris', translator(lang)('favTitle'));
}

export default async function Favoris({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const sp = await searchParams;
  const me = await getMe();
  if (!me) {
    return (
      <div className="wrap"><div className="empty-state panel" style={{ margin: '40px auto', maxWidth: 520 }}>
        <h1 style={{ fontSize: '1.6rem' }}>{t('favTitle')}</h1><p className="muted">{t('loginToSave')}</p>
        <Link className="btn" href={`/${lang}/connexion?next=/${lang}/favoris`}>{t('login')}</Link>
      </div></div>
    );
  }
  const [favIds, trips] = await withDb(me.id, async (db) => [
    (await rows<{ listing_id: string }>(db, 'select listing_id from public.favorites where user_id = $1 order by created_at', [me.id])).map((r) => r.listing_id),
    await rows<{ id: string; dest_slug: string; dest_name: I18n; start_date: string; end_date: string; items: string[] }>(db,
      `select t.id, d.slug as dest_slug, d.name as dest_name, to_char(t.start_date, 'YYYY-MM-DD') as start_date, to_char(t.end_date, 'YYYY-MM-DD') as end_date,
              coalesce((select array_agg(i.listing_id order by i.sort_order) from public.trip_items i where i.trip_id = t.id), '{}') as items
         from public.trips t join public.destinations d on d.id = t.destination_id
        where t.user_id = $1 order by (t.end_date < current_date), t.start_date`, [me.id]),
  ] as const);
  const trip = trips.find((x) => x.id === sp.sejour) ?? trips[0];
  const [favCards, tripCards] = await Promise.all([
    favIds.length ? searchCards({ ids: favIds }) : Promise.resolve([]),
    trip?.items.length ? searchCards({ ids: trip.items }) : Promise.resolve([]),
  ]);
  const favSet = new Set(favIds);
  const inTrip = new Set(trip?.items ?? []);
  const forTrip = trip ? favCards.filter((c) => c.dest_slug === trip.dest_slug) : [];
  const others = trip ? favCards.filter((c) => c.dest_slug !== trip.dest_slug) : favCards;
  const path = `/${lang}/favoris${trip ? `?sejour=${trip.id}` : ''}`;
  const orderedTrip = trip ? trip.items.map((id) => tripCards.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c) : [];

  const tripToggle = (id: string, on: boolean) => trip && (
    <form action={toggleTripItem}>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={path} />
      <input type="hidden" name="trip" value={trip.id} /><input type="hidden" name="listing" value={id} />
      <button className={`btn sm ${on ? 'ghost' : ''}`}>{on ? `✓ ${t('inThisTrip')}` : `＋ ${t('addThis')}`}</button>
    </form>
  );

  return (
    <div className="wrap acct-layout">
      <AccountNav lang={lang} active="favoris" />
      <div className="stack" style={{ gap: 24 }}>
        <div className="stack" style={{ gap: 4 }}><span className="eyebrow">{t('navFav')}</span><h1 style={{ fontSize: '2rem' }}>{t('favTitle')}</h1>
          <p className="muted small">{t('favText')}</p></div>
        {sp.nouveau && trip && <div className="notice ok" role="status"><b>{t('tripSaved')}.</b> {t('stayCreatedMsg')}</div>}

        {trips.length > 0 ? (
          <div className="stack">
            <div className="chips" aria-label={t('tripsOf')}>{trips.map((x) => (
              <Link key={x.id} className={`chip ${x.id === trip?.id ? 'on' : ''}`} href={`/${lang}/favoris?sejour=${x.id}`}>
                {tr(x.dest_name, lang)} · {fDate(x.start_date, lang, { day: 'numeric', month: 'short' })}
              </Link>))}
              <Link className="chip" href={`/${lang}/sejour#nouveau`}>＋ {t('newStay')}</Link>
            </div>
          </div>
        ) : (
          <div className="notice info row between"><span>{t('noTripYet')}</span><Link className="btn sm" href={`/${lang}/sejour`}>{t('newStay')}</Link></div>
        )}

        {trip && (
          <div className="panel stack">
            <div className="row between">
              <h2 style={{ fontSize: '1.3rem' }}>{t('activeStay')} : {tr(trip.dest_name, lang)}, {fDate(trip.start_date, lang)} → {fDate(trip.end_date, lang)}</h2>
              <span className="pill">{orderedTrip.length} {t('elements')}</span>
            </div>
            {orderedTrip.length ? (
              <div className="stack" style={{ gap: 8 }}>{orderedTrip.map((c) => (
                <div key={c.id} className="cart-line">
                  <div className="thumb"><Pic c={c} /></div>
                  <div className="stack" style={{ gap: 2 }}><Link href={listingHref(lang, c)} style={{ color: 'inherit', fontWeight: 700 }}>{tr(c.title, lang)}</Link>
                    <span className="small muted">{tr(c.cat_name, lang)}{c.booking_required && <> · <span className="pill sun">{t('bookReq')}</span></>}</span></div>
                  {tripToggle(c.id, true)}
                </div>))}
              </div>
            ) : <p className="muted small">{t('none')}</p>}
            {orderedTrip.some((c) => c.lat != null) && <MapView label={t('mapTitle')} height={300}
              points={orderedTrip.filter((c) => c.lat != null).map((c, n) => ({ lat: c.lat!, lng: c.lng!, label: String(n + 1), title: tr(c.title, lang), href: listingHref(lang, c) }))} />}
            <div className="notice info">{t('plannerSoon')}</div>
          </div>
        )}

        {trip && (
          <div className="stack"><h2 style={{ fontSize: '1.3rem' }}>{t('favForTrip')}</h2>
            {forTrip.length ? <div className="grid g4">{forTrip.map((c) => <Card key={c.id} c={c} lang={lang} fav={favSet.has(c.id)} path={path}
              extra={c.type !== 'hebergement' ? tripToggle(c.id, inTrip.has(c.id)) : null} />)}</div>
              : <p className="muted small">{t('noFav')} <Link href={`/${lang}/destinations/${trip.dest_slug}`}>{tr(trip.dest_name, lang)} →</Link></p>}
          </div>
        )}
        {others.length > 0 && (
          <div className="stack">{trip && <h2 style={{ fontSize: '1.3rem' }}>{t('otherFavs')}</h2>}
            <div className="grid g4">{others.map((c) => <Card key={c.id} c={c} lang={lang} fav={favSet.has(c.id)} path={path} />)}</div></div>
        )}
        {!favCards.length && <p className="muted">{t('noFav')}</p>}
      </div>
    </div>
  );
}
