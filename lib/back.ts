import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { requireMe, type Me } from './auth';
import { withDb, rows, one } from './db';
import type { I18n, Lang } from './i18n';

/** Espace administration : un visiteur va à la connexion, un autre rôle voit « page introuvable ». */
export async function requireAdmin(lang: Lang, path: string) {
  const me = await requireMe(lang, path);
  if (me.role !== 'admin') notFound();
  return me;
}
/** Espace prestataire : réservé aux comptes prestataires (l'administrateur gère les prestataires depuis l'administration). */
export async function requireProvider(lang: Lang, path: string) {
  const me = await requireMe(lang, path);
  if (me.role === 'admin') redirect(`/${lang}/admin/prestataires`);
  if (me.role !== 'provider') notFound();
  return me;
}

export const LISTING_STATUSES = ['draft', 'pending', 'changes_requested', 'published', 'refused', 'archived'] as const;
export const LISTING_TYPES = ['hebergement', 'excursion', 'lieu'] as const;
export const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type Provider = { id: string; trade_name: string; logo_path: string | null; email: string | null; phone: string | null; address: string | null;
  country_code: string; destination_id: string | null; description: I18n; legal_info: Record<string, string>; status: string;
  payout_method: string; manual_payout_details: Record<string, string>; approved_at: string | null };

export async function myProvider(me: Me) {
  return withDb(me.id, (db) => one<Provider>(db,
    `select id, trade_name, logo_path, email, phone, address, country_code, destination_id, description, legal_info, status::text as status,
            payout_method::text as payout_method, manual_payout_details, approved_at from public.providers where owner_id = $1 order by created_at limit 1`, [me.id]));
}

export type ListingRow = { id: string; slug: string; type: string; status: string; title: I18n; dest_name: I18n; cat_name: I18n;
  provider: string | null; cover: string | null; updated_at: string; photos: number };

export async function listListings(uid: string, f: { q?: string; dest?: string; type?: string; status?: string; provider?: string }) {
  const where: string[] = []; const args: unknown[] = [];
  if (f.q) { args.push(`%${f.q}%`); where.push(`(l.title->>'fr' ilike $${args.length} or l.title->>'en' ilike $${args.length} or l.slug ilike $${args.length})`); }
  if (f.dest) { args.push(f.dest); where.push(`d.slug = $${args.length}`); }
  if (f.type && (LISTING_TYPES as readonly string[]).includes(f.type)) { args.push(f.type); where.push(`l.type = $${args.length}::public.listing_type`); }
  if (f.status && (LISTING_STATUSES as readonly string[]).includes(f.status)) { args.push(f.status); where.push(`l.status = $${args.length}::public.listing_status`); }
  if (f.provider) { args.push(f.provider); where.push(`l.provider_id = $${args.length}`); }
  return withDb(uid, (db) => rows<ListingRow>(db,
    `select l.id, l.slug, l.type::text as type, l.status::text as status, l.title, d.name as dest_name, c.name as cat_name,
            p.trade_name as provider, to_char(l.updated_at, 'YYYY-MM-DD') as updated_at,
            (select m.storage_path from public.listing_media m where m.listing_id = l.id and m.kind = 'photo' order by m.sort_order limit 1) as cover,
            (select count(*)::int from public.listing_media m where m.listing_id = l.id) as photos
       from public.listings l join public.destinations d on d.id = l.destination_id join public.categories c on c.id = l.category_id
       left join public.providers p on p.id = l.provider_id
      ${where.length ? 'where ' + where.join(' and ') : ''}
      order by case l.status when 'pending' then 0 when 'changes_requested' then 1 when 'draft' then 2 else 3 end, l.updated_at desc limit 500`, args));
}

export type FullListing = { id: string; provider_id: string | null; destination_id: string; category_id: string; type: string; slug: string;
  status: string; title: I18n; summary: I18n; description: I18n; address: string | null; lat: number | null; lng: number | null;
  google_maps_url: string | null; google_place_id: string | null; opening_hours: Record<string, string[][]> | null; price_from: string | null;
  visit_minutes: number | null; booking_required: boolean; accessibility: string | null; best_period: I18n; tips: I18n; highlights: Record<string, string[]>;
  conditions: I18n; cancellation_policy: I18n; moderation_note: string | null; dest_slug: string };

export async function getListing(uid: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return withDb(uid, async (db) => {
    const l = await one<FullListing>(db, `select l.id, l.provider_id, l.destination_id, l.category_id, l.type::text as type, l.slug, l.status::text as status,
        l.title, l.summary, l.description, l.address, l.lat, l.lng, l.google_maps_url, l.google_place_id, l.opening_hours, l.price_from::text as price_from,
        l.visit_minutes, l.booking_required, l.accessibility, l.best_period, l.tips, l.highlights, l.conditions, l.cancellation_policy, l.moderation_note,
        d.slug as dest_slug
      from public.listings l join public.destinations d on d.id = l.destination_id where l.id = $1`, [id]);
    if (!l) return null;
    const media = await rows<{ id: string; kind: string; storage_path: string; sort_order: number }>(db,
      `select id, kind, storage_path, sort_order from public.listing_media where listing_id = $1 order by sort_order, created_at`, [id]);
    const units = await rows<{ id: string; name: I18n; max_guests: number; base_price_night: string; cleaning_fee: string; min_nights: number;
      check_in_time: string; check_out_time: string; ical_export_token: string | null }>(db,
      `select id, name, max_guests, base_price_night::text, cleaning_fee::text, min_nights, to_char(check_in_time, 'HH24:MI') as check_in_time,
              to_char(check_out_time, 'HH24:MI') as check_out_time, public.unit_export_token(id) as ical_export_token from public.accommodation_units where listing_id = $1 order by created_at`, [id]);
    const rates = await rows<{ id: string; unit_id: string; first: string; last: string; price_night: string; min_nights: number | null }>(db,
      `select r.id, r.unit_id, to_char(lower(r.period), 'YYYY-MM-DD') as first, to_char(upper(r.period) - 1, 'YYYY-MM-DD') as last,
              r.price_night::text, r.min_nights from public.unit_rates r join public.accommodation_units u on u.id = r.unit_id
        where u.listing_id = $1 order by lower(r.period)`, [id]);
    const blocks = await rows<{ id: string; unit_id: string; first: string; last: string; source: string; note: string | null }>(db,
      `select b.id, b.unit_id, to_char(lower(b.period), 'YYYY-MM-DD') as first, to_char(upper(b.period) - 1, 'YYYY-MM-DD') as last, b.source::text, b.note
         from public.unit_blocks b join public.accommodation_units u on u.id = b.unit_id
        where u.listing_id = $1 and upper(b.period) >= current_date order by lower(b.period)`, [id]);
    const schedules = await rows<{ id: string; weekdays: number[]; start_time: string; duration_min: number; capacity: number; price_adult: string;
      price_child: string | null; child_max_age: number | null; meeting_point: string | null; valid_from: string | null; valid_to: string | null }>(db,
      `select id, weekdays, to_char(start_time, 'HH24:MI') as start_time, duration_min, capacity, price_adult::text, price_child::text, child_max_age,
              meeting_point, to_char(valid_from, 'YYYY-MM-DD') as valid_from, to_char(valid_to, 'YYYY-MM-DD') as valid_to
         from public.excursion_schedules where listing_id = $1 order by start_time`, [id]);
    const slots = await rows<{ id: string; starts_at: string; capacity: number; seats_reserved: number; status: string }>(db,
      `select s.id, to_char(s.starts_at at time zone d.timezone, 'YYYY-MM-DD"T"HH24:MI') as starts_at, s.capacity, s.seats_reserved, s.status::text
         from public.excursion_slots s join public.listings l on l.id = s.listing_id join public.destinations d on d.id = l.destination_id
        where s.listing_id = $1 and s.starts_at >= now() order by s.starts_at limit 40`, [id]);
    return { ...l, media, units, rates, blocks, schedules, slots };
  });
}

export async function editorOptions(uid: string, withProviders: boolean) {
  return withDb(uid, async (db) => ({
    dests: await rows<{ id: string; slug: string; name: I18n }>(db, `select id, slug, name from public.destinations order by sort_order, slug`),
    cats: await rows<{ id: string; slug: string; type: string; name: I18n; parent_id: string | null }>(db,
      `select id, slug, type::text as type, name, parent_id from public.categories order by type, parent_id nulls first, sort_order`),
    providers: withProviders ? await rows<{ id: string; trade_name: string }>(db, `select id, trade_name from public.providers order by trade_name`) : [],
  }));
}

/** Lien public d'une annonce (pour « Voir sur le site »). */
export const publicHref = (lang: string, l: { type: string; slug: string; dest_slug: string }) =>
  `/${lang}/destinations/${l.dest_slug}/${l.slug}`;
