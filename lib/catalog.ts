import 'server-only';
import { cache } from 'react';
import { withDb, rows, one, type Db } from './db';
import type { I18n } from './i18n';

export type ListingType = 'hebergement' | 'excursion' | 'lieu';
export type Card = {
  id: string; slug: string; type: ListingType; dest_slug: string; dest_name: I18n; cat_slug: string; cat_name: I18n;
  title: I18n; summary: I18n; price_from: string | null; rating_avg: string | null; rating_count: number; booking_required: boolean;
  lat: number | null; lng: number | null; address: string | null; cover: string | null; capacity: number | null;
  duration: number | null; provider_name: string | null; currency: string;
};
export type Destination = { id: string; slug: string; name: I18n; description: I18n; country_code: string; timezone: string;
  lat: number; lng: number; cover_path: string | null; theme: { accent?: string; pal?: string } };
export type Category = { id: string; slug: string; type: ListingType; name: I18n; parent_slug: string | null };

const CARD_SQL = `
  select l.id, l.slug, l.type, d.slug as dest_slug, d.name as dest_name, c.slug as cat_slug, c.name as cat_name,
         l.title, l.summary, l.price_from, l.rating_avg, l.rating_count, l.booking_required, l.lat, l.lng, l.address, l.currency,
         (select m.storage_path from public.listing_media m where m.listing_id = l.id and m.kind = 'photo' order by m.sort_order limit 1) as cover,
         (select max(u.max_guests) from public.accommodation_units u where u.listing_id = l.id and u.is_active) as capacity,
         coalesce(l.visit_minutes, (select min(s.duration_min) from public.excursion_schedules s where s.listing_id = l.id)) as duration,
         (select p.trade_name from public.provider_cards p where p.id = l.provider_id) as provider_name
    from public.listings l
    join public.destinations d on d.id = l.destination_id
    join public.categories c on c.id = l.category_id
   where l.status = 'published' and d.is_active`;

export const getDestinations = cache(() =>
  withDb(null, (db) => rows<Destination>(db, `select id, slug, name, description, country_code, timezone, lat, lng, cover_path, theme
    from public.destinations where is_active order by sort_order, slug`)));

export const getCategories = cache(() =>
  withDb(null, (db) => rows<Category>(db, `select c.id, c.slug, c.type, c.name, p.slug as parent_slug
    from public.categories c left join public.categories p on p.id = c.parent_id
   where c.parent_id is not null or c.type = 'lieu' order by c.type, c.sort_order`)));

export type Filters = { dest?: string; type?: string; sub?: string; q?: string; max?: string; ids?: string[]; limit?: number };
export async function searchCards(f: Filters, db?: Db) {
  const where: string[] = []; const p: unknown[] = [];
  const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
  if (f.dest) add('d.slug = ?', f.dest);
  if (f.type) add('l.type = ?::public.listing_type', f.type);
  if (f.sub) add('c.slug = ?', f.sub);
  if (f.max && Number(f.max) >= 0) add('coalesce(l.price_from, 0) <= ?', Number(f.max));
  if (f.ids) add('l.id = any(?::uuid[])', f.ids);
  if (f.q) add(`(l.title::text || ' ' || l.summary::text || ' ' || coalesce(l.address, '') || ' ' || c.name::text) ilike ?`, `%${f.q.trim()}%`);
  const sql = `${CARD_SQL}${where.length ? ' and ' + where.join(' and ') : ''}
    order by l.rating_avg desc nulls last, l.published_at desc${f.limit ? ` limit ${Math.floor(f.limit)}` : ''}`;
  return db ? rows<Card>(db, sql, p) : withDb(null, (d) => rows<Card>(d, sql, p));
}

export type Detail = Card & {
  description: I18n; google_maps_url: string | null; google_place_id: string | null; opening_hours: Record<string, string[][]> | null;
  visit_minutes: number | null; accessibility: string | null; tips: I18n; highlights: I18n; conditions: I18n;
  cancellation_policy: { free_until_hours?: number; refund_pct_after?: number }; dest_timezone: string;
  media: { kind: string; storage_path: string; alt: I18n }[];
  units: { id: string; name: I18n; max_guests: number; base_price_night: string; cleaning_fee: string; min_nights: number;
    check_in_time: string; check_out_time: string }[];
  schedules: { weekdays: number[]; start_time: string; duration_min: number; capacity: number; price_adult: string;
    price_child: string | null; child_max_age: number | null; meeting_point: string | null }[];
};

export async function getDetail(dest: string, slug: string) {
  return withDb(null, async (db) => {
    const base = await one<Card & { extra: Omit<Detail, keyof Card | 'media' | 'units' | 'schedules'> }>(db,
      `select x.*, (select to_jsonb(e) from (select l.description, l.google_maps_url, l.google_place_id, l.opening_hours, l.visit_minutes,
              l.accessibility, l.tips, l.highlights, l.conditions, l.cancellation_policy, d.timezone as dest_timezone
            from public.listings l join public.destinations d on d.id = l.destination_id where l.id = x.id) e) as extra
         from (${CARD_SQL} and d.slug = $1 and l.slug = $2) x`, [dest, slug]);
    if (!base) return null;
    const media = await rows<Detail['media'][number]>(db, `select kind, storage_path, alt from public.listing_media where listing_id = $1 order by sort_order`, [base.id]);
    const units = await rows<Detail['units'][number]>(db, `select id, name, max_guests, base_price_night, cleaning_fee, min_nights,
        to_char(check_in_time, 'HH24:MI') as check_in_time, to_char(check_out_time, 'HH24:MI') as check_out_time
      from public.accommodation_units where listing_id = $1 and is_active order by base_price_night`, [base.id]);
    const schedules = await rows<Detail['schedules'][number]>(db, `select weekdays, to_char(start_time, 'HH24:MI') as start_time, duration_min, capacity,
        price_adult, price_child, child_max_age, meeting_point from public.excursion_schedules where listing_id = $1 and valid_to >= current_date
      order by start_time`, [base.id]);
    const { extra, ...card } = base;
    return { ...card, ...extra, media, units, schedules } as Detail;
  });
}

export type Slot = { id: string; starts_at: string; ends_at: string; local_date: string; local_time: string; seats_left: number;
  price_adult: string; price_child: string | null; meeting_point: string | null };

/** Créneaux ouverts d'une excursion pour une date (heure locale de la destination). */
export async function getSlots(listingId: string, date: string, tz: string, db?: Db) {
  const sql = `select id, starts_at, ends_at, to_char(starts_at at time zone $3, 'YYYY-MM-DD') as local_date,
      to_char(starts_at at time zone $3, 'HH24:MI') as local_time, public.slot_seats_left(id) as seats_left,
      price_adult, price_child, meeting_point
    from public.excursion_slots where listing_id = $1 and status = 'open' and starts_at > now()
      and (starts_at at time zone $3)::date = $2::date order by starts_at`;
  return db ? rows<Slot>(db, sql, [listingId, date, tz]) : withDb(null, (d) => rows<Slot>(d, sql, [listingId, date, tz]));
}

/** Prochaines dates ayant au moins un départ avec des places. */
export async function nextSlotDates(listingId: string, tz: string) {
  return withDb(null, (db) => rows<{ d: string }>(db, `select distinct to_char(starts_at at time zone $2, 'YYYY-MM-DD') as d
    from public.excursion_slots where listing_id = $1 and status = 'open' and starts_at > now() and capacity > seats_reserved
    order by 1 limit 60`, [listingId, tz]));
}

export async function busyNights(unitId: string, from: string, to: string) {
  return withDb(null, (db) => rows<{ night: string }>(db, `select to_char(night, 'YYYY-MM-DD') as night from public.get_unit_busy_nights($1, $2::date, $3::date)`, [unitId, from, to]));
}

export async function providerNames() {
  return withDb(null, (db) => rows<{ trade_name: string }>(db, `select trade_name from public.provider_cards order by trade_name`));
}

export async function siteContent(key: string) {
  return withDb(null, (db) => one<{ value: Record<string, Record<string, string>> }>(db, `select value from public.site_content where key = $1`, [key]));
}

export async function homeReviews() {
  return withDb(null, (db) => rows<{ rating: number; body: string; listing_title: I18n; created_at: string }>(db,
    `select r.rating, r.body, l.title as listing_title, r.created_at from public.reviews r join public.listings l on l.id = r.listing_id
      where r.is_visible order by r.rating desc, r.created_at desc limit 3`));
}

/** Distance à vol d'oiseau (km). Les temps de trajet réels viendront de Google Routes dans le planificateur. */
export function km(a: { lat: number | null; lng: number | null }, b: { lat: number | null; lng: number | null }) {
  if (a.lat == null || b.lat == null || a.lng == null || b.lng == null) return Infinity;
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export const gmaps = (i: { lat: number | null; lng: number | null; google_place_id?: string | null; google_maps_url?: string | null; address?: string | null }) =>
  i.google_maps_url ||
  (i.lat != null ? `https://www.google.com/maps/search/?api=1&query=${i.lat},${i.lng}${i.google_place_id ? `&query_place_id=${i.google_place_id}` : ''}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.address || '')}`);
