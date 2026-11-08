import 'server-only';
import { withDb, one, rows } from './db';
import type { I18n } from './i18n';
import type { TripInitial } from '@/components/TripWizard';

export type TripRow = {
  id: string; title: string | null; dest_slug: string; dest_name: I18n; dest_tz: string; start_date: string; end_date: string; nights: number;
  arrival_time: string | null; departure_time: string | null; adults: number; children: number; children_ages: number[];
  accommodation_mode: string; accommodation_id: string | null; acc_title: I18n | null; acc_slug: string | null;
  ext_acc_name: string | null; ext_acc_address: string | null; ext_acc_lat: number | null; ext_acc_lng: number | null;
  ext_check_in: string | null; ext_check_out: string | null; transport_info: string | null; regions: string[]; preference_keys: string[];
  pace: string; activity_start: string; activity_end: string; free_time_min: number; active_weekdays: number[];
  budget: string | null; budget_scope: string; archived_at: string | null; n_items: number;
};

const TRIP_SQL = `select t.id, t.title, d.slug as dest_slug, d.name as dest_name, d.timezone as dest_tz,
    to_char(t.start_date, 'YYYY-MM-DD') as start_date, to_char(t.end_date, 'YYYY-MM-DD') as end_date, t.nights,
    to_char(t.arrival_time, 'HH24:MI') as arrival_time, to_char(t.departure_time, 'HH24:MI') as departure_time,
    t.adults, t.children, t.children_ages, t.accommodation_mode, t.accommodation_id, a.title as acc_title, a.slug as acc_slug,
    t.ext_acc_name, t.ext_acc_address, t.ext_acc_lat, t.ext_acc_lng, to_char(t.ext_check_in, 'HH24:MI') as ext_check_in,
    to_char(t.ext_check_out, 'HH24:MI') as ext_check_out, t.transport_info, t.regions, t.preference_keys, t.pace::text as pace,
    to_char(t.activity_start, 'HH24:MI') as activity_start, to_char(t.activity_end, 'HH24:MI') as activity_end, t.free_time_min,
    t.active_weekdays, t.budget, t.budget_scope, t.archived_at, (select count(*)::int from public.trip_items i where i.trip_id = t.id) as n_items
  from public.trips t join public.destinations d on d.id = t.destination_id left join public.listings a on a.id = t.accommodation_id`;

export const getTrip = (userId: string, id: string) =>
  withDb(userId, (db) => one<TripRow>(db, `${TRIP_SQL} where t.id = $1 and t.user_id = $2`, [id, userId])).catch(() => null);

export const listTrips = (userId: string) =>
  withDb(userId, (db) => rows<TripRow>(db, `${TRIP_SQL} where t.user_id = $1 order by (t.end_date < current_date), t.start_date`, [userId]));

export const accommodationOptions = (userId: string) =>
  withDb(userId, (db) => rows<{ id: string; dest: string; title: I18n }>(db,
    `select l.id, d.slug as dest, l.title from public.listings l join public.destinations d on d.id = l.destination_id
      where l.type = 'hebergement' and l.status = 'published'
      order by (l.id in (select listing_id from public.favorites where user_id = $1)) desc, l.title->>'fr'`, [userId]));

/** Valeurs du questionnaire : séjour existant (modification) ou valeurs par défaut (création). */
export function wizardValues(t: TripRow | null, defaults: { dest: string; start: string; end: string }): TripInitial {
  if (!t) {
    return { destination: defaults.dest, title: '', regions: '', start_date: defaults.start, end_date: defaults.end, arrival_time: '', departure_time: '',
      transport_info: '', accommodation_mode: 'undecided', accommodation_id: '', ext_acc_name: '', ext_acc_address: '', ext_gps: '',
      ext_check_in: '', ext_check_out: '', adults: 2, children: 0, children_ages: [], prefs: [], pace: 'balanced', activity_start: '09:00',
      activity_end: '19:00', free_time_min: 60, weekdays: [0, 1, 2, 3, 4, 5, 6], budget: '', budget_scope: 'group' };
  }
  return { id: t.id, destination: t.dest_slug, title: t.title ?? '', regions: t.regions.join(', '), start_date: t.start_date, end_date: t.end_date,
    arrival_time: t.arrival_time ?? '', departure_time: t.departure_time ?? '', transport_info: t.transport_info ?? '',
    accommodation_mode: t.accommodation_mode, accommodation_id: t.accommodation_id ?? '', ext_acc_name: t.ext_acc_name ?? '',
    ext_acc_address: t.ext_acc_address ?? '', ext_gps: t.ext_acc_lat != null ? `${t.ext_acc_lat}, ${t.ext_acc_lng}` : '',
    ext_check_in: t.ext_check_in ?? '', ext_check_out: t.ext_check_out ?? '', adults: t.adults, children: t.children,
    children_ages: t.children_ages, prefs: t.preference_keys, pace: t.pace, activity_start: t.activity_start, activity_end: t.activity_end,
    free_time_min: t.free_time_min, weekdays: t.active_weekdays, budget: t.budget ? String(Number(t.budget)) : '', budget_scope: t.budget_scope };
}
