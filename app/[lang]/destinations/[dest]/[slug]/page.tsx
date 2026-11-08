import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Pic, listingHref } from '@/components/Card';
import { FavButton } from '@/components/FavButton';
import { MapView } from '@/components/MapView';
import { ExcursionForm, StayForm } from '@/components/BookingForms';
import { type Detail, busyNights, getDetail, getSlots, gmaps, km, nextSlotDates, searchCards } from '@/lib/catalog';
import { withDb, rows } from '@/lib/db';
import { durL, fDate, isLang, money, t, translator, tr, type Lang } from '@/lib/i18n';
import { destIn } from '@/lib/country';
import { destImgUrl } from '@/components/DestImg';
import { JsonLd } from '@/components/JsonLd';
import { abs, breadcrumb, clip, pageMeta, SITE_URL } from '@/lib/seo';
import { storageUrl } from '@/lib/supabase';
import { getUserState } from '@/lib/user-data';
import { toggleTripItem } from '@/app/actions';
import { PaywallSlot } from '@/components/PaywallSlot';
import { PlannerNudge } from '@/components/PlannerNudge';

type P = { params: Promise<{ lang: string; dest: string; slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

const ogImage = (i: Detail) => {
  const photo = i.media.find((m) => m.kind === 'photo');
  return photo ? storageUrl('listing-media', photo.storage_path) : destImgUrl({ slug: i.dest_slug, cover_path: null });
};

export async function generateMetadata({ params }: P) {
  const { lang: l, dest, slug } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const i = await getDetail(dest, slug);
  if (!i) return {};
  const title = tr(i.title, lang);
  const where = destIn(dest, tr(i.dest_name, lang), lang);
  const from = t(lang, 'from');
  const price = Number(i.price_from) > 0 ? ` ${from[0].toUpperCase() + from.slice(1)} ${money(i.price_from, lang, i.currency)}${i.type === 'hebergement' ? ' / ' + t(lang, 'perNightShort') : ''}.` : '';
  // titre le plus précis qui tient dans ~60 caractères (au-delà, Google le coupe)
  const inWhere = lang === 'fr' ? where : t(lang, 'inDest', where);
  const options = [`${title} · ${tr(i.cat_name, lang)} ${inWhere}`, `${title} ${inWhere}`, title];
  const best = options.find((o) => o.length + 16 <= 62);
  const summary = tr(i.summary, lang).replace(/\.?$/, '.');
  return pageMeta({ lang, path: `/destinations/${dest}/${slug}`,
    title: best ?? options.find((o) => o.length <= 62) ?? title, absoluteTitle: !best,
    description: clip(`${summary}${price} ${i.type === 'lieu' ? '' : t(lang, 'seoBookOnline') + '.'}`),
    image: ogImage(i), imageAlt: title });
}

const SCHEMA_LIEU: Record<string, string> = { restaurant: 'Restaurant', plage: 'Beach', 'point-de-vue': 'TouristAttraction', marche: 'TouristAttraction' };
const DAY_SCHEMA = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Données structurées d'une fiche : hébergement, excursion ou lieu, avec position GPS, prix et horaires. */
function listingLd(i: Detail, lang: Lang) {
  const url = abs(lang, `/destinations/${i.dest_slug}/${i.slug}`);
  const img = ogImage(i);
  const common = {
    '@id': url + '#fiche', name: tr(i.title, lang), description: tr(i.description, lang) || tr(i.summary, lang), url,
    image: img ? (img.startsWith('http') ? img : SITE_URL + img) : undefined,
    geo: i.lat != null ? { '@type': 'GeoCoordinates', latitude: i.lat, longitude: i.lng } : undefined,
    address: i.address ? { '@type': 'PostalAddress', streetAddress: i.address, addressRegion: tr(i.dest_name, lang) } : undefined,
    hasMap: gmaps(i),
    // une note n'est publiée que si elle vient de vrais avis clients
    aggregateRating: i.rating_count > 0 && i.rating_avg ? { '@type': 'AggregateRating', ratingValue: Number(i.rating_avg), reviewCount: i.rating_count, bestRating: 5 } : undefined,
  };
  const offer = (price: number | string | null) => Number(price) > 0
    ? { '@type': 'Offer', price: Number(price), priceCurrency: i.currency, url, availability: 'https://schema.org/InStock' } : undefined;
  if (i.type === 'hebergement') {
    const u = i.units[0];
    return { '@type': 'LodgingBusiness', ...common, priceRange: i.price_from ? `${t(lang, 'from')} ${money(i.price_from, lang, i.currency)}` : undefined,
      checkinTime: u?.check_in_time, checkoutTime: u?.check_out_time, numberOfRooms: i.units.length || undefined,
      makesOffer: offer(i.price_from) };
  }
  if (i.type === 'excursion') {
    return { '@type': 'TouristTrip', ...common, touristType: tr(i.cat_name, lang), offers: offer(i.price_from || i.schedules[0]?.price_adult),
      provider: i.provider_name ? { '@type': 'Organization', name: i.provider_name } : undefined,
      itinerary: i.schedules[0]?.meeting_point ? { '@type': 'Place', name: i.schedules[0].meeting_point } : undefined };
  }
  const hours = i.opening_hours ? Object.entries(i.opening_hours).filter(([, h]) => h.length).map(([d, h]) => ({
    '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_SCHEMA[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(d)], opens: h[0][0], closes: h[0][1] })) : undefined;
  return { '@type': SCHEMA_LIEU[i.cat_slug] || 'TouristAttraction', ...common, openingHoursSpecification: hours,
    isAccessibleForFree: !(Number(i.price_from) > 0), ...(i.cat_slug === 'restaurant' && i.price_from ? { priceRange: `~${money(i.price_from, lang, i.currency)}` } : {}) };
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

export default async function ListingPage({ params, searchParams }: P) {
  const { lang: l, dest, slug } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const sp = await searchParams;
  const i = await getDetail(dest, slug);
  if (!i) notFound();
  const { me, favs } = await getUserState();
  const path = listingHref(lang, i);
  const title = tr(i.title, lang);
  const dayNames = Array.from({ length: 7 }, (_, k) => new Date(2024, 0, 7 + k).toLocaleDateString(lang, { weekday: 'short' }));

  // Séjour(s) de la personne pour cette destination : préremplit les dates et le bouton « Ajouter à mon séjour »
  const trip = me ? (await withDb(me.id, (db) => rows<{ id: string; start_date: string; end_date: string; adults: number; in_trip: boolean }>(db,
    `select t.id, to_char(t.start_date, 'YYYY-MM-DD') as start_date, to_char(t.end_date, 'YYYY-MM-DD') as end_date, t.adults,
            exists (select 1 from public.trip_items x where x.trip_id = t.id and x.listing_id = $2) as in_trip
       from public.trips t join public.destinations d on d.id = t.destination_id
      where t.user_id = $1 and d.slug = $3 order by (t.end_date < current_date), t.start_date limit 1`, [me.id, i.id, dest])))[0] : undefined;

  const [nearAll, busy, dates] = await Promise.all([
    searchCards({ dest }),
    i.type === 'hebergement' && i.units[0] ? busyNights(i.units[0].id, plus(0), plus(60)) : Promise.resolve([]),
    i.type === 'excursion' ? nextSlotDates(i.id, i.dest_timezone) : Promise.resolve([]),
  ]);
  const near = nearAll.filter((x) => x.id !== i.id).map((x) => [x, km(i, x)] as const).sort((a, b) => a[1] - b[1]).slice(0, 4);
  const exDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : (trip && dates.find((d) => d.d >= trip.start_date && d.d < trip.end_date)?.d) || dates[0]?.d || plus(1);
  const slots = i.type === 'excursion' ? await getSlots(i.id, exDate, i.dest_timezone) : [];

  const fact = (k: string, v: React.ReactNode) => <div className="fact" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>;
  const hours = i.opening_hours ? (() => {
    const open = DAY_KEYS.map((k, n) => [n, i.opening_hours![k] ?? []] as const);
    const first = open.find(([, h]) => h.length)?.[1][0];
    const closed = open.filter(([, h]) => !h.length).map(([n]) => dayNames[n]);
    return first ? `${first[0]} – ${first[1]}${closed.length ? ` (${t('closedOn')} ${closed.join(', ')})` : ''}` : t('closedS');
  })() : null;
  const sched = i.schedules;
  const weekdays = [...new Set(sched.flatMap((s) => s.weekdays))].sort();
  const policy = i.cancellation_policy || {};

  let box: React.ReactNode;
  if (i.type === 'hebergement' && i.units.length) {
    const u0 = i.units[0];
    const dIn = sp.in || trip?.start_date || plus(30), dOut = sp.out || trip?.end_date || plus(30 + Math.max(u0.min_nights, 3));
    box = <StayForm lang={lang} path={path}
      units={i.units.map((u) => ({ id: u.id, name: tr(u.name, lang), max: u.max_guests, min: u.min_nights, price: Number(u.base_price_night) }))}
      defaults={{ in: dIn, out: dOut, adults: Math.min(u0.max_guests, Number(sp.tr) || trip?.adults || 2) }}
      labels={{ from: t('from'), perNight: t('perNight'), accom: t('accom'), arrival: t('arrival'), departure: t('departure'), adults: t('adults'),
        children: t('children'), errDates: t('errDates'), minStay: t('minStay'), tooMany: t('tooMany'), datesTaken: t('datesTaken'), nights: t('nightsS'),
        cleaning: t('cleaning'), total: t('total'), addCart: t('addCart'), rules: `${t('minStay', u0.min_nights)} · ${t('checkInOut', u0.check_in_time, u0.check_out_time)}` }} />;
  } else if (i.type === 'excursion') {
    box = (
      <Suspense>
        <ExcursionForm lang={lang} path={path} date={exDate} dates={dates.map((d) => d.d)} maxSeats={Math.max(...sched.map((s) => s.capacity), 1)}
          priceFrom={Number(i.price_from || sched[0]?.price_adult || 0)}
          slots={slots.map((s) => ({ id: s.id, time: s.local_time, left: s.seats_left, adult: Number(s.price_adult), child: s.price_child == null ? null : Number(s.price_child), meeting: s.meeting_point }))}
          labels={{ perPers: t('perPers'), date: t('date'), pickDate: t('pickDate'), time: t('time'), seatsLeft: t('seatsLeft'), noSlots: t('noSlots'),
            adults: t('adults'), children: t('children'), childPrice: t('childPrice'), addCart: t('addCart'),
            cancelPolicy: policy.free_until_hours ? t('cancelPolicy').replace('48', String(policy.free_until_hours)) : t('cancelPolicy') }} />
      </Suspense>
    );
  } else {
    box = (
      <div className="panel stack sticky">
        <div>{Number(i.price_from) > 0 ? <><span className="price num">{new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(i.price_from))}</span> <span className="muted small">{t('approxPP')}</span></> : <span className="pill ok">{t('freeAccess')}</span>}</div>
        <p className="small muted">{t('noBookNeeded')}</p>
      </div>
    );
  }

  const gallery = i.media.filter((m) => m.kind === 'photo').slice(0, 3);
  const ld = { '@graph': [
    breadcrumb([{ name: 'StayNdiscover', url: abs(lang) }, { name: tr(i.dest_name, lang), url: abs(lang, `/destinations/${dest}`) },
      { name: tr(i.cat_name, lang), url: abs(lang, `/explorer?type=${i.type}&dest=${dest}&sub=${i.cat_slug}`) }, { name: title, url: abs(lang, `/destinations/${dest}/${slug}`) }]),
    listingLd(i, lang),
  ] };
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <JsonLd data={ld} />
      <PaywallSlot lang={lang} basePath={path} sp={sp} />
      <PlannerNudge href={`/${lang}/sejour/nouveau?dest=${dest}`} hasTrip={!!trip}
        l={{ title: t('nudgeTitle'), text: t('nudgeText'), go: t('nudgeGo'), later: t('nudgeLater') }} />
      <div className="pagehead">
        <nav aria-label="breadcrumb" className="row small muted"><Link href={`/${lang}/destinations/${dest}`}>{tr(i.dest_name, lang)}</Link><span>›</span><Link href={`/${lang}/explorer?type=${i.type}&dest=${dest}&sub=${i.cat_slug}`}>{tr(i.cat_name, lang)}</Link></nav>
        <div className="row between">
          <h1 style={{ fontSize: 'clamp(1.8rem,3.4vw,2.6rem)' }}>{title}</h1>
          <div className="row">
            <FavButton id={i.id} on={favs.has(i.id)} path={path} label={favs.has(i.id) ? t('removeFav') : t('fav')} inline />
            <form action={toggleTripItem} className="inline">
              <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={path} />
              <input type="hidden" name="listing" value={i.id} /><input type="hidden" name="dest" value={dest} />
              {trip && <input type="hidden" name="trip" value={trip.id} />}
              <button className="btn ghost sm">{trip?.in_trip ? `✓ ${t('inStay')}` : `＋ ${t('addToStay')}`}</button>
            </form>
          </div>
        </div>
        <div className="row small muted">
          {i.rating_avg && <span>★ {Number(i.rating_avg).toFixed(1)}{i.rating_count ? ` (${i.rating_count} ${t('reviewsN')})` : ''}</span>}
          {i.address && <span>{i.address}</span>}
          {i.provider_name && <span>· {i.provider_name}</span>}
        </div>
      </div>
      <div className="gallery">
        {[0, 1, 2].map((n) => (
          <div key={n}>{gallery[n]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={storageUrl('listing-media', gallery[n].storage_path)} alt={tr(gallery[n].alt, lang) || title} loading={n ? 'lazy' : 'eager'} />
            : <Pic c={{ ...i, cover: null }} k={'abc'[n]} />}</div>
        ))}
      </div>
      <div className="layout2" style={{ marginTop: 28 }}>
        <div className="stack" style={{ gap: 24 }}>
          <div className="stack"><h2>{t('about')}</h2><p>{tr(i.summary, lang)}</p>{tr(i.description, lang) && <p>{tr(i.description, lang)}</p>}</div>
          <div className="stack"><h3>{t('practical')}</h3>
            <div className="facts">
              {i.type === 'hebergement' && i.units[0] && [
                fact(t('capacity'), t('capN', Math.max(...i.units.map((u) => u.max_guests)))),
                fact(t('minStayL'), `${i.units[0].min_nights} ${t('nightsS')}`),
                fact(t('checkin'), i.units[0].check_in_time), fact(t('checkout'), i.units[0].check_out_time)]}
              {i.duration && fact(t('duration'), durL(i.duration))}
              {sched.length > 0 && fact(t('departures'), [...new Set(sched.map((s) => s.start_time))].join(' · '))}
              {weekdays.length > 0 && fact(t('daysAvail'), weekdays.length === 7 ? t('everyDay') : weekdays.map((d) => dayNames[d]).join(', '))}
              {hours && fact(t('hours'), hours)}
              {i.type !== 'hebergement' && fact(t('booking'), i.booking_required ? t('required') : t('notRequired'))}
              {i.type === 'excursion' && sched[0] && fact(t('maxCap'), Math.max(...sched.map((s) => s.capacity)))}
              {i.accessibility && fact(t('access'), i.accessibility)}
              {tr(i.highlights, lang) && fact(t('bestTime'), tr(i.highlights, lang))}
            </div>
            {tr(i.tips, lang) && <div className="notice info"><b>{t('tip')} :</b> {tr(i.tips, lang)}</div>}
            {tr(i.conditions, lang) && <div className="notice"><b>{t('bookCond')} :</b> {tr(i.conditions, lang)}</div>}
          </div>
          {i.type === 'hebergement' && i.units[0] && (
            <div className="stack"><div className="row between"><h3>{t('busyNights')}</h3><span className="pill ok">{t('calChecked')}</span></div>
              {busy.length ? <><p className="small muted">{t('next60')}</p><div className="busy">{busy.map((b) => <span key={b.night}>{fDate(b.night, lang)}</span>)}</div></>
                : <p className="small muted">{t('allFree')}</p>}
            </div>
          )}
          <div className="stack">
            <div className="row between"><h3>{t('location')}</h3><a className="btn ghost sm" href={gmaps(i)} target="_blank" rel="noopener noreferrer">{t('openGmaps')}</a></div>
            {i.lat != null && <MapView label={t('mapTitle')} height={320} points={[{ lat: i.lat, lng: i.lng!, label: '★', title }].concat(
              near.filter(([x]) => x.lat != null).map(([x], n) => ({ lat: x.lat!, lng: x.lng!, label: String(n + 1), title: tr(x.title, lang) })))} />}
            <p className="small muted num">{i.address}{i.lat != null && ` · GPS ${i.lat.toFixed(4)}, ${i.lng!.toFixed(4)}`}</p>
          </div>
          {near.length > 0 && (
            <div className="stack"><h3>{t('nearby')}</h3>
              <div className="stack" style={{ gap: 6 }}>{near.map(([x, d], n) => (
                <Link key={x.id} href={listingHref(lang, x)} className="row between panel" style={{ padding: '10px 14px', textDecoration: 'none', color: 'inherit' }}>
                  <span><b>{n + 1}.</b> {tr(x.title, lang)} <span className="small muted">· {tr(x.cat_name, lang)}</span></span>
                  {Number.isFinite(d) && <span className="small muted num">{d.toFixed(1)} km</span>}
                </Link>))}
              </div>
            </div>
          )}
        </div>
        <div>{box}</div>
      </div>
    </div>
  );
}
