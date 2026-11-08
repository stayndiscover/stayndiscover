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
  const { error } = await sb.auth.signInWithPassword({ email: str(f, 'email'), password: String(f.get('password') ?? '') });
  if (error) return { error: t(lang, error.code === 'invalid_credentials' ? 'errLogin' : 'errGeneric'), values: { email: str(f, 'email') } };
  revalidatePath('/', 'layout');
  redirect(safePath(str(f, 'next'), lang) === `/${lang}` ? `/${lang}/compte` : safePath(str(f, 'next'), lang));
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
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next === `/${lang}` ? `/${lang}/compte` : next)}`,
    },
  });
  if (error) return { error: t(lang, error.code === 'user_already_exists' ? 'errExists' : error.code === 'weak_password' ? 'errPwd' : 'errGeneric'), values };
  if (!data.session) return { ok: t(lang, 'checkEmail') }; // confirmation par e-mail activée dans Supabase
  revalidatePath('/', 'layout');
  redirect(next === `/${lang}` ? `/${lang}/compte` : next);
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
export async function createTrip(_: FormState, f: FormData): Promise<FormState> {
  const me = await needMe(f);
  const lang = langOf(f);
  const start = str(f, 'start_date'), end = str(f, 'end_date');
  if (!start || !end || end < start) return { error: t(lang, 'errDates') };
  const time = (k: string) => str(f, k) || null;
  let id: string;
  try {
    id = await withDb(me.id, async (db) => {
      const trip = await one<{ id: string; destination_id: string }>(db, `insert into public.trips
          (user_id, destination_id, start_date, end_date, arrival_time, departure_time, adults, children, accommodation_id,
           activity_start, activity_end, pace, budget, preferences)
        values ($1, (select id from public.destinations where slug = $2), $3, $4, $5, $6, $7, $8, nullif($9, '')::uuid,
                coalesce($10::time, '09:00'), coalesce($11::time, '19:00'), $12::public.trip_pace, nullif($13, '')::numeric, nullif($14, ''))
        returning id, destination_id`,
        [me.id, str(f, 'destination'), start, end, time('arrival_time'), time('departure_time'), Math.max(1, Number(str(f, 'adults')) || 1),
          Math.max(0, Number(str(f, 'children')) || 0), str(f, 'accommodation_id'), time('activity_start'), time('activity_end'),
          ['calm', 'balanced', 'intense'].includes(str(f, 'pace')) ? str(f, 'pace') : 'balanced', str(f, 'budget'), str(f, 'preferences')]);
      if (!trip) throw new Error('INVALID: destination');
      // Comme prévu au cahier des charges : les favoris de cette destination rejoignent le séjour
      // (même au-delà de l'essai gratuit du planificateur : la sélection n'est jamais perdue)
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
  redirect(`/${lang}/favoris?sejour=${id}&nouveau=1`);
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
  if (!ok) redirect(`/${lang}/sejour?nouveau=1&dest=${encodeURIComponent(str(f, 'dest'))}`);
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

