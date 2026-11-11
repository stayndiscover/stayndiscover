'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import { getMe } from '@/lib/auth';
import { withDb, one, rows, dbMessage } from '@/lib/db';
import { isLang, t, type Lang } from '@/lib/i18n';

export type FormState = { error?: string; ok?: string; values?: Record<string, string> } | null;

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const langOf = (f: FormData): Lang => { const l = str(f, 'lang'); return isLang(l) ? l : 'fr'; };
/** Évite les redirections vers un autre site : on ne garde que les chemins internes. */
const safePath = (p: string, lang: Lang) => (p.startsWith('/') && !p.startsWith('//') ? p : `/${lang}`);
const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

async function needMe(f: FormData) {
  const me = await getMe();
  if (!me) {
    const lang = langOf(f);
    redirect(`/${lang}/connexion?next=${encodeURIComponent(safePath(str(f, 'path') || `/${lang}`, lang))}`);
  }
  return me;
}

// ---------------------------------------------------------------- Comptes
export async function signIn(_: FormState, f: FormData): Promise<FormState> {
  const lang = langOf(f);
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword({ email: str(f, 'email'), password: String(f.get('password') ?? '') });
  if (error) return { error: t(lang, error.code === 'invalid_credentials' ? 'errLogin' : 'errGeneric'), values: { email: str(f, 'email') } };
  revalidatePath('/', 'layout');
  const next = safePath(str(f, 'next'), lang);
  if (next !== `/${lang}`) redirect(next);
  // sans page demandée : chacun arrive dans SON espace (administration, prestataire ou voyageur)
  const role = data.user ? (await withDb(data.user.id, (db) => one<{ role: string }>(db, 'select role::text as role from public.profiles where id = $1', [data.user!.id])))?.role : null;
  redirect(role === 'admin' ? `/${lang}/admin` : role === 'provider' ? `/${lang}/pro` : `/${lang}/compte`);
}

export async function signUp(_: FormState, f: FormData): Promise<FormState> {
  const lang = langOf(f);
  const password = String(f.get('password') ?? '');
  const values = { email: str(f, 'email'), full_name: str(f, 'full_name'), account_type: str(f, 'account_type') };
  if (password.length < 8) return { error: t(lang, 'errPwd'), values };
  const next = safePath(str(f, 'next'), lang);
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signUp({
    email: str(f, 'email'), password,
    options: {
      data: { full_name: str(f, 'full_name'), lang, account_type: str(f, 'account_type') === 'provider' ? 'provider' : 'client' },
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next === `/${lang}` ? (values.account_type === 'provider' ? `/${lang}/pro` : `/${lang}/compte`) : next)}`,
    },
  });
  if (error) return { error: t(lang, error.code === 'user_already_exists' ? 'errExists' : error.code === 'weak_password' ? 'errPwd' : 'errGeneric'), values };
  if (!data.session) return { ok: t(lang, 'checkEmail') }; // confirmation par e-mail activée dans Supabase
  revalidatePath('/', 'layout');
  const home = values.account_type === 'provider' ? `/${lang}/pro` : `/${lang}/compte`;
  redirect(next === `/${lang}` ? home : next);
}

export async function resetPassword(_: FormState, f: FormData): Promise<FormState> {
  const lang = langOf(f);
  const sb = await supabaseServer();
  await sb.auth.resetPasswordForEmail(str(f, 'email'), { redirectTo: `${siteUrl()}/auth/confirm?next=/${lang}/compte%23mot-de-passe` });
  return { ok: t(lang, 'resetSent') };
}

export async function signOut(f: FormData) {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  revalidatePath('/', 'layout');
  redirect(`/${langOf(f)}`);
}

export async function updateProfile(_: FormState, f: FormData): Promise<FormState> {
  const me = await needMe(f);
  const lang = langOf(f);
  const pref = str(f, 'preferred_lang');
  await withDb(me.id, (db) => db.query('update public.profiles set full_name = $2, phone = $3, preferred_lang = $4, updated_at = now() where id = $1',
    [me.id, str(f, 'full_name') || null, str(f, 'phone') || null, isLang(pref) ? pref : 'fr']));
  const password = String(f.get('password') ?? '');
  if (password) {
    if (password.length < 8) return { error: t(lang, 'errPwd') };
    const sb = await supabaseServer();
    const { error } = await sb.auth.updateUser({ password });
    if (error) return { error: t(lang, 'errGeneric') };
  }
  revalidatePath('/', 'layout');
  return { ok: t(lang, 'saved') };
}

// ---------------------------------------------------------------- Favoris
export async function toggleFavorite(f: FormData) {
  const me = await needMe(f);
  const listing = str(f, 'listing');
  await withDb(me.id, async (db) => {
    const del = await db.query('delete from public.favorites where user_id = $1 and listing_id = $2', [me.id, listing]);
    if (!del.rowCount) await db.query('insert into public.favorites (user_id, listing_id) values ($1, $2) on conflict do nothing', [me.id, listing]);
  });
  revalidatePath('/', 'layout');
}

// ---------------------------------------------------------------- Séjours
const PREF_KEYS = ['plages','excursions-terrestres','nautique','bateau','plongee','dauphins','randonnees','nature','gastronomie',
  'restaurants','marches','culture','musees','distilleries','famille','sport','spots-photo','points-de-vue','insolite'];
const isTime = (x: string) => /^\d{2}:\d{2}$/.test(x);
const isDay = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);

/** Questionnaire du séjour (création ou modification) : tout est vérifié puis enregistré dans Supabase. */
export async function saveTrip(_: FormState, f: FormData): Promise<FormState> {
  const me = await needMe(f);
  const lang = langOf(f);
  const tripId = str(f, 'trip');
  const start = str(f, 'start_date'), end = str(f, 'end_date');
  if (!str(f, 'destination')) return { error: t(lang, 'errRequired') };
  if (!isDay(start) || !isDay(end) || end <= start) return { error: t(lang, 'errDates') };
  const mode = ['staynd', 'elsewhere', 'find', 'undecided'].includes(str(f, 'accommodation_mode')) ? str(f, 'accommodation_mode') : 'undecided';
  let lat: number | null = null, lng: number | null = null;
  if (mode === 'elsewhere') {
    if (!str(f, 'ext_acc_name') || !str(f, 'ext_acc_address')) return { error: t(lang, 'errRequired') };
    const gps = str(f, 'ext_gps');
    if (gps) {
      const m = gps.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
      if (!m || Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) return { error: t(lang, 'errGps') };
      lat = +m[1]; lng = +m[2];
    }
  }
  if (mode === 'staynd' && !str(f, 'accommodation_id')) return { error: t(lang, 'errRequired') };
  const adults = Math.max(1, Math.min(30, Number(str(f, 'adults')) || 1));
  const ages = f.getAll('child_age').map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 17).slice(0, 30);
  const prefs = f.getAll('prefs').map(String).filter((x) => PREF_KEYS.includes(x));
  const weekdays = f.getAll('weekdays').map(Number).filter((x) => x >= 0 && x <= 6);
  const time = (k: string) => (isTime(str(f, k)) ? str(f, k) : null);
  const actStart = time('activity_start') ?? '09:00', actEnd = time('activity_end') ?? '19:00';
  if (actEnd <= actStart) return { error: t(lang, 'errDates') };
  const values = [
    str(f, 'destination'), str(f, 'title').slice(0, 120) || null, start, end, time('arrival_time'), time('departure_time'), adults, ages.length,
    mode === 'staynd' ? str(f, 'accommodation_id') : null, actStart, actEnd,
    ['calm', 'balanced', 'intense'].includes(str(f, 'pace')) ? str(f, 'pace') : 'balanced', str(f, 'budget') ? Math.max(0, Number(str(f, 'budget'))) : null,
    mode, mode === 'elsewhere' ? str(f, 'ext_acc_name').slice(0, 200) : null, mode === 'elsewhere' ? str(f, 'ext_acc_address').slice(0, 500) : null, lat, lng,
    mode === 'elsewhere' ? time('ext_check_in') : null, mode === 'elsewhere' ? time('ext_check_out') : null, ages,
    str(f, 'transport_info').slice(0, 1000) || null, str(f, 'regions').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20),
    prefs, Math.max(0, Math.min(720, Number(str(f, 'free_time_min')) || 0)), weekdays.length ? weekdays : [0, 1, 2, 3, 4, 5, 6],
    str(f, 'budget_scope') === 'person' ? 'person' : 'group',
  ];
  const cols = `destination_id = (select id from public.destinations where slug = $1), title = $2, start_date = $3, end_date = $4, arrival_time = $5,
    departure_time = $6, adults = $7, children = $8, accommodation_id = nullif($9, '')::uuid, activity_start = $10, activity_end = $11,
    pace = $12::public.trip_pace, budget = $13, accommodation_mode = $14, ext_acc_name = $15, ext_acc_address = $16, ext_acc_lat = $17,
    ext_acc_lng = $18, ext_check_in = $19, ext_check_out = $20, children_ages = $21, transport_info = $22, regions = $23,
    preference_keys = $24, free_time_min = $25, active_weekdays = $26, budget_scope = $27, updated_at = now()`;
  let id: string;
  try {
    id = await withDb(me.id, async (db) => {
      if (tripId) {
        const r = await one<{ id: string }>(db, `update public.trips set ${cols} where id = $28 and user_id = $29 returning id`, [...values, tripId, me.id]);
        if (!r) throw new Error('FORBIDDEN: séjour inconnu');
        return r.id;
      }
      const trip = await one<{ id: string; destination_id: string }>(db, `insert into public.trips (user_id, destination_id, start_date, end_date)
        values ($1, (select id from public.destinations where slug = $2), $3, $4) returning id, destination_id`, [me.id, values[0], start, end]);
      if (!trip) throw new Error('INVALID: destination');
      await db.query(`update public.trips set ${cols} where id = $28 and user_id = $29`, [...values, trip.id, me.id]);
      // Comme prévu : les favoris de cette destination rejoignent le séjour (même au-delà de l'essai gratuit)
      await db.query(`select set_config('stayndiscover.trip_creation', 'on', true)`);
      await db.query(`insert into public.trip_items (trip_id, listing_id, sort_order)
        select $1, f.listing_id, row_number() over (order by f.created_at) from public.favorites f
          join public.listings l on l.id = f.listing_id
         where f.user_id = $2 and l.destination_id = $3 and l.type <> 'hebergement' on conflict do nothing`, [trip.id, me.id, trip.destination_id]);
      await db.query(`select set_config('stayndiscover.trip_creation', '', true)`);
      return trip.id;
    });
  } catch (e) {
    return { error: dbMessage(e) || t(lang, 'errGeneric') };
  }
  revalidatePath('/', 'layout');
  redirect(`/${lang}/sejour/${id}?${tripId ? 'modifie' : 'nouveau'}=1`);
}

export async function setTripArchived(f: FormData) {
  const me = await needMe(f);
  await withDb(me.id, (db) => db.query('select public.set_trip_archived($1, $2)', [str(f, 'trip'), str(f, 'archived') === '1']));
  revalidatePath('/', 'layout');
  redirect(`/${langOf(f)}/sejour`);
}

/** « Planifier mon voyage » : demande les 19,99 € si le séjour n'est pas débloqué (décision de Marion). */
export async function planVoyage(f: FormData) {
  const me = await needMe(f);
  const lang = langOf(f);
  const trip = str(f, 'trip');
  const st = await withDb(me.id, (db) => one<{ s: { unlocked: boolean } }>(db, 'select public.planner_status($1) as s', [trip]));
  const path = `/${lang}/sejour/${trip}`;
  if (!st?.s.unlocked) redirect(withParams(path, { offre: 'planificateur', sejour: trip }));
  // Phase 3 : ici, lancement du moteur de planification
  redirect(withParams(path, { planning: 'bientot' }) + '#planning');
}

export async function deleteTrip(f: FormData) {
  const me = await needMe(f);
  await withDb(me.id, (db) => db.query('delete from public.trips where id = $1 and user_id = $2', [str(f, 'trip'), me.id]));
  revalidatePath('/', 'layout');
}

export async function toggleTripItem(f: FormData) {
  const me = await needMe(f);
  const lang = langOf(f);
  const listing = str(f, 'listing');
  let trip = str(f, 'trip');
  let paywall = false;
  const ok = await withDb(me.id, async (db) => {
    if (!trip) {
      // séjour le plus proche dans le temps pour la destination de la fiche
      const t0 = await one<{ id: string }>(db, `select t.id from public.trips t join public.listings l on l.destination_id = t.destination_id
        where l.id = $1 and t.user_id = $2 order by (t.end_date < current_date), t.start_date limit 1`, [listing, me.id]);
      if (!t0) return false;
      trip = t0.id;
    }
    const del = await db.query('delete from public.trip_items where trip_id = $1 and listing_id = $2', [trip, listing]);
    if (!del.rowCount) {
      await db.query('savepoint add_item');
      try {
        await db.query(`insert into public.trip_items (trip_id, listing_id, sort_order)
          values ($1, $2, coalesce((select max(sort_order) + 1 from public.trip_items where trip_id = $1), 1))`, [trip, listing]);
      } catch (e) {
        if (!String(e instanceof Error ? e.message : e).startsWith('PAYWALL')) throw e;
        await db.query('rollback to savepoint add_item');
        paywall = true;
      }
    }
    return true;
  });
  if (!ok) redirect(`/${lang}/sejour/nouveau?dest=${encodeURIComponent(str(f, 'dest'))}`);
  if (paywall) redirect(withParams(safePath(str(f, 'path'), lang), { offre: 'planificateur', sejour: trip }));
  revalidatePath('/', 'layout');
}

/**
 * Cœur de l'espace « Mon séjour ». Hébergement : favori du compte (candidat pour le séjour).
 * Activité, lieu, restaurant… : favori du compte ET élément du séjour (au-delà de l'essai gratuit : fenêtre de déblocage).
 */
export async function toggleTripFavorite(f: FormData) {
  const me = await needMe(f);
  const lang = langOf(f);
  const trip = str(f, 'trip'), listing = str(f, 'listing');
  let paywall = false;
  await withDb(me.id, async (db) => {
    const l = await one<{ type: string; owns: boolean }>(db, `select l.type::text as type,
        exists (select 1 from public.trips t where t.id = $2 and t.user_id = $3 and t.destination_id = l.destination_id) as owns
      from public.listings l where l.id = $1`, [listing, trip, me.id]);
    if (!l?.owns) throw new Error('FORBIDDEN: séjour inconnu');
    if (l.type === 'hebergement') {
      const del = await db.query('delete from public.favorites where user_id = $1 and listing_id = $2', [me.id, listing]);
      if (!del.rowCount) await db.query('insert into public.favorites (user_id, listing_id) values ($1, $2) on conflict do nothing', [me.id, listing]);
      return;
    }
    const del = await db.query('delete from public.trip_items where trip_id = $1 and listing_id = $2', [trip, listing]);
    if (del.rowCount) {
      await db.query('delete from public.favorites where user_id = $1 and listing_id = $2', [me.id, listing]);
      return;
    }
    await db.query('savepoint add_item');
    try {
      await db.query(`insert into public.trip_items (trip_id, listing_id, sort_order)
        values ($1, $2, coalesce((select max(sort_order) + 1 from public.trip_items where trip_id = $1), 1))`, [trip, listing]);
      await db.query('insert into public.favorites (user_id, listing_id) values ($1, $2) on conflict do nothing', [me.id, listing]);
    } catch (e) {
      if (!String(e instanceof Error ? e.message : e).startsWith('PAYWALL')) throw e;
      await db.query('rollback to savepoint add_item');
      paywall = true;
    }
  });
  if (paywall) redirect(withParams(safePath(str(f, 'path'), lang), { offre: 'planificateur', sejour: trip }));
  revalidatePath('/', 'layout');
}

/** Ajoute ou remplace des paramètres dans une adresse interne. */
function withParams(path: string, params: Record<string, string>) {
  const u = new URL(path, 'http://x');
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.pathname + u.search;
}

/** Bouton « Débloquer pour 19,99 € » : enregistre la demande au prix fixé par l'admin, puis envoie vers le paiement. */
export async function unlockPlanner(f: FormData) {
  const me = await needMe(f);
  const lang = langOf(f);
  const trip = str(f, 'trip');
  await withDb(me.id, (db) => db.query('select public.request_planner_unlock($1)', [trip]));
  // Étape Stripe : ici, création de la session Stripe Checkout puis redirection vers la page de paiement.
  // En attendant que le compte Stripe soit relié, la demande reste enregistrée et la fenêtre l'indique.
  redirect(withParams(safePath(str(f, 'path'), lang), { offre: 'planificateur', sejour: trip, attente: '1' }));
}

// ---------------------------------------------------------------- Panier
export async function addStayToCart(_: FormState, f: FormData): Promise<FormState> {
  const me = await needMe(f);
  const lang = langOf(f);
  const unit = str(f, 'unit'), start = str(f, 'start_date'), end = str(f, 'end_date');
  const adults = Math.max(1, Number(str(f, 'adults')) || 1), children = Math.max(0, Number(str(f, 'children')) || 0);
  try {
    await withDb(me.id, async (db) => {
      await one(db, 'select public.quote_stay($1, $2::date, $3::date, $4)', [unit, start, end, adults + children]);
      const free = await one<{ ok: boolean }>(db, 'select not exists (select 1 from public.get_unit_busy_nights($1, $2::date, $3::date)) as ok', [unit, start, end]);
      if (!free?.ok) throw new Error('UNAVAILABLE: ' + t(lang, 'datesTaken'));
      await db.query(`insert into public.cart_items (user_id, listing_id, unit_id, start_date, end_date, adults, children, trip_id)
        select $1, listing_id, id, $3, $4, $5, $6, (select t.id from public.trips t where t.user_id = $1 and t.destination_id =
          (select destination_id from public.listings l where l.id = u.listing_id) and t.end_date >= $3::date and t.start_date <= $4::date limit 1)
          from public.accommodation_units u where id = $2`, [me.id, unit, start, end, adults, children]);
    });
  } catch (e) {
    return { error: translateDbError(dbMessage(e), lang) };
  }
  revalidatePath('/', 'layout');
  redirect(`/${lang}/panier`);
}

export async function addExcursionToCart(_: FormState, f: FormData): Promise<FormState> {
  const me = await needMe(f);
  const lang = langOf(f);
  const slot = str(f, 'slot');
  const adults = Math.max(0, Number(str(f, 'adults')) || 0), children = Math.max(0, Number(str(f, 'children')) || 0);
  if (!slot) return { error: t(lang, 'noSlots') };
  if (adults + children < 1) return { error: t(lang, 'errGeneric') };
  try {
    await withDb(me.id, async (db) => {
      const s = await one<{ listing_id: string; left: number }>(db, `select listing_id, public.slot_seats_left(id) as left
        from public.excursion_slots where id = $1 and status = 'open' and starts_at > now()`, [slot]);
      if (!s) throw new Error('UNAVAILABLE: ' + t(lang, 'noSlots'));
      if (s.left < adults + children) throw new Error('UNAVAILABLE: ' + t(lang, 'seatsLeft', Math.max(0, s.left)));
      await db.query(`insert into public.cart_items (user_id, listing_id, slot_id, adults, children) values ($1, $2, $3, $4, $5)`,
        [me.id, s.listing_id, slot, adults, children]);
    });
  } catch (e) {
    return { error: translateDbError(dbMessage(e), lang) };
  }
  revalidatePath('/', 'layout');
  redirect(`/${lang}/panier`);
}

export async function removeCartItem(f: FormData) {
  const me = await needMe(f);
  await withDb(me.id, (db) => db.query('delete from public.cart_items where id = $1 and user_id = $2', [str(f, 'item'), me.id]));
  revalidatePath('/', 'layout');
}

function translateDbError(m: string, lang: Lang) {
  if (/séjour minimum (\d+)/.test(m)) return t(lang, 'minStay', m.match(/(\d+)/)![1]);
  if (/(\d+) voyageurs maximum/.test(m)) return t(lang, 'tooMany', m.match(/(\d+)/)![1]);
  if (/dates incorrectes/.test(m)) return t(lang, 'errDates');
  if (/cart_items_check|violates check/.test(m)) return t(lang, 'errDates');
  return m || t(lang, 'errGeneric');
}

// ---------------------------------------------------------------- Newsletter
export async function subscribeNewsletter(_: FormState, f: FormData): Promise<FormState> {
  const lang = langOf(f);
  const email = str(f, 'email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: t(lang, 'invalidEmail') };
  const me = await getMe();
  await withDb(me?.id ?? null, (db) => db.query('insert into public.newsletter_subscribers (email, lang) values ($1, $2) on conflict do nothing', [email, lang]));
  return { ok: t(lang, 'nlOk') };
}

