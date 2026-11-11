'use server';
// Actions des espaces prestataire et administration. Toutes passent par la base avec l'identité de la personne :
// les règles de sécurité (RLS + fonctions admin_*) décident de ce qui est permis, pas l'interface.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import { getMe, type Me } from '@/lib/auth';
import { withDb, one, rows, dbMessage, type Db } from '@/lib/db';
import { isLang, t, type Lang } from '@/lib/i18n';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const num = (f: FormData, k: string) => { const v = str(f, k).replace(',', '.'); return v === '' || isNaN(Number(v)) ? null : Number(v); };
const langOf = (f: FormData): Lang => { const l = str(f, 'lang'); return isLang(l) ? l : 'fr'; };
const safePath = (p: string, lang: Lang) => (p.startsWith('/') && !p.startsWith('//') ? p.split('?')[0].split('#')[0] : `/${lang}`);
const UUID = /^[0-9a-f-]{36}$/;
const i18n = (f: FormData, k: string) => {
  const o: Record<string, string> = {};
  for (const l of ['fr', 'en', 'es']) { const v = str(f, `${k}_${l}`); if (v) o[l] = v; }
  return o;
};

async function staff(f: FormData, roles: Me['role'][]) {
  const me = await getMe();
  const lang = langOf(f);
  if (!me) redirect(`/${lang}/connexion`);
  if (!roles.includes(me.role)) redirect(`/${lang}`);
  return { me, lang };
}
/** Retour à la page d'origine avec un message (ok=… ou err=…), à l'ancre indiquée. */
function back(f: FormData, lang: Lang, msg: { ok?: string; err?: string }, extraPath?: string): never {
  const path = extraPath ?? safePath(str(f, 'path'), lang);
  const q = new URLSearchParams();
  if (msg.ok) q.set('ok', msg.ok);
  if (msg.err) q.set('err', msg.err.slice(0, 300));
  q.set('v', Date.now().toString(36)); // chaque retour a une adresse distincte (rafraîchit la page même après deux actions identiques)
  const anchor = str(f, 'anchor');
  revalidatePath(path);
  redirect(`${path}?${q.toString()}${anchor ? `#${anchor}` : ''}`);
}
async function attempt(f: FormData, lang: Lang, fn: () => Promise<void>, ok = 'saved') {
  let err: string | null = null;
  try { await fn(); } catch (e) { err = dbMessage(e); }
  back(f, lang, err ? { err } : { ok });
}

const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'annonce';

async function freeSlug(db: Db, dest: string, base: string, id: string | null) {
  let s = base, i = 2;
  while ((await one<{ t: boolean }>(db, `select public.listing_slug_taken($1, $2, $3::uuid) as t`, [dest, s, id]))?.t) s = `${base}-${i++}`;
  return s;
}

// ------------------------------------------------------------------ Annonces (admin et prestataire)
export async function saveListing(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  const admin = me.role === 'admin';
  const base = admin ? `/${lang}/admin/annonces` : `/${lang}/pro/annonces`;
  const id = UUID.test(str(f, 'id')) ? str(f, 'id') : null;
  const title = i18n(f, 'title');
  const dest = str(f, 'destination_id'), cat = str(f, 'category_id');
  if (!UUID.test(dest) || !UUID.test(cat)) back(f, lang, { err: t(lang, 'ed_needDestCat') });
  if (!title.fr) back(f, lang, { err: t(lang, 'ed_needTitle') });
  const lat = num(f, 'lat'), lng = num(f, 'lng');
  const address = str(f, 'address') || null, gmaps = str(f, 'google_maps_url') || null, place = str(f, 'google_place_id') || null;
  if (!address && !gmaps && !place && (lat === null || lng === null)) back(f, lang, { err: t(lang, 'ed_needLoc') });

  const hours: Record<string, string[][]> = {};
  for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    const v = str(f, `h_${d}`);
    const ranges = v.split(',').map((r) => r.trim().split('-').map((x) => x.trim())).filter((r) => r.length === 2 && /^\d{1,2}:\d{2}$/.test(r[0]) && /^\d{1,2}:\d{2}$/.test(r[1]))
      .map(([a, b]) => [a.padStart(5, '0'), b.padStart(5, '0')]);
    if (ranges.length) hours[d] = ranges;
  }
  const highlights: Record<string, string[]> = {};
  for (const l of ['fr', 'en', 'es']) { const v = str(f, `highlights_${l}`).split('\n').map((x) => x.trim()).filter(Boolean); if (v.length) highlights[l] = v; }
  const free = num(f, 'cancel_free_hours'), pct = num(f, 'cancel_refund_pct');
  const cancellation = free === null && pct === null ? {} : { free_until_hours: free ?? 0, refund_pct_after: pct ?? 0 };

  let newId = id;
  let err: string | null = null;
  try {
    await withDb(me.id, async (db) => {
      const cur = id ? await one<{ type: string; status: string; provider_id: string | null }>(db, `select type::text as type, status::text as status, provider_id from public.listings where id = $1`, [id]) : null;
      if (id && !cur) throw new Error('FORBIDDEN: annonce introuvable');
      const type = cur?.type ?? str(f, 'type');
      if (!['hebergement', 'excursion', 'lieu'].includes(type)) throw new Error('INVALID: type inconnu');
      const catOk = await one(db, `select 1 from public.categories where id = $1 and type = $2::public.listing_type`, [cat, type]);
      if (!catOk) throw new Error(`INVALID: ${t(lang, 'ed_needDestCat')}`);
      let provider: string | null;
      if (admin) provider = UUID.test(str(f, 'provider_id')) ? str(f, 'provider_id') : null;
      else provider = (await one<{ id: string }>(db, `select id from public.providers where owner_id = $1 order by created_at limit 1`, [me.id]))?.id ?? null;
      if (!admin && !provider) throw new Error(`INVALID: ${t(lang, 'pro_needProfile')}`);
      if (type !== 'lieu' && !provider) throw new Error(`INVALID: ${t(lang, 'ed_needProvider')}`);
      const wanted = slugify(str(f, 'slug') || title.fr);
      const slug = await freeSlug(db, dest, wanted, id);
      const vals = [provider, dest, cat, slug, JSON.stringify(title), JSON.stringify(i18n(f, 'summary')), JSON.stringify(i18n(f, 'description')),
        address, lat, lng, gmaps, place, Object.keys(hours).length ? JSON.stringify(hours) : null, num(f, 'price_from'), num(f, 'visit_minutes'),
        f.get('booking_required') === 'on', str(f, 'accessibility') || null, JSON.stringify(i18n(f, 'best_period')), JSON.stringify(i18n(f, 'tips')),
        JSON.stringify(highlights), JSON.stringify(i18n(f, 'conditions')), JSON.stringify(cancellation)];
      if (id) {
        await db.query(`update public.listings set provider_id = $1, destination_id = $2, category_id = $3, slug = $4, title = $5, summary = $6, description = $7,
            address = $8, lat = $9, lng = $10, google_maps_url = $11, google_place_id = $12, opening_hours = $13, price_from = $14, visit_minutes = $15,
            booking_required = $16, accessibility = $17, best_period = $18, tips = $19, highlights = $20, conditions = $21, cancellation_policy = $22
          where id = $23`, [...vals, id]);
      } else {
        const r = await one<{ id: string }>(db, `insert into public.listings (provider_id, destination_id, category_id, slug, title, summary, description,
            address, lat, lng, google_maps_url, google_place_id, opening_hours, price_from, visit_minutes, booking_required, accessibility, best_period, tips,
            highlights, conditions, cancellation_policy, type, status, created_by)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::public.listing_type,'draft',$24) returning id`, [...vals, type, me.id]);
        newId = r!.id;
      }
    });
  } catch (e) { err = dbMessage(e); }
  if (err) back(f, lang, { err });
  revalidatePath('/', 'layout');
  redirect(`${base}/${newId}?ok=saved`);
}

export async function moderateListing(f: FormData) {
  const { me, lang } = await staff(f, ['admin']);
  const status = str(f, 'status');
  const preset = str(f, 'preset');
  const note = preset ? t(lang, preset) + (str(f, 'note') ? `\n\n${str(f, 'note')}` : '') : str(f, 'note');
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    await db.query(`select public.admin_moderate_listing($1, $2::public.listing_status, $3)`, [str(f, 'id'), status, note || null]);
  }).then(() => revalidatePath('/', 'layout')));
}

export async function submitListing(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => { await db.query(`select public.submit_listing($1)`, [str(f, 'id')]); }), 'submitted');
}

export async function deleteListing(f: FormData) {
  const { me, lang } = await staff(f, ['admin']);
  if (f.get('confirm') !== 'on') back(f, lang, { err: t(lang, 'bo_confirmDel') });
  let err: string | null = null;
  try {
    const paths = await withDb(me.id, async (db) => {
      const m = await rows<{ storage_path: string }>(db, `select storage_path from public.listing_media where listing_id = $1 and kind = 'photo'`, [str(f, 'id')]);
      await db.query(`delete from public.listings where id = $1`, [str(f, 'id')]);
      return m.map((x) => x.storage_path);
    });
    if (paths.length) await (await supabaseServer()).storage.from('listing-media').remove(paths);
  } catch (e) { err = dbMessage(e); }
  if (err) back(f, lang, { err });
  revalidatePath('/', 'layout');
  redirect(`/${lang}/admin/annonces?ok=deleted`);
}

// ------------------------------------------------------------------ Photos et vidéos
export async function uploadMedia(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  const id = str(f, 'id');
  const files = f.getAll('files').filter((x): x is File => x instanceof File && x.size > 0);
  let err: string | null = null;
  try {
    if (!UUID.test(id)) throw new Error('INVALID: annonce inconnue');
    // contrôle des droits avant l'envoi
    const ok = await withDb(me.id, (db) => one<{ ok: boolean }>(db, `select public.can_edit_listing($1) as ok`, [id]));
    if (!ok?.ok) throw new Error('FORBIDDEN: annonce d\'un autre prestataire');
    const sb = await supabaseServer();
    for (const file of files) {
      if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error(`INVALID: ${file.name} : format non accepté (JPG, PNG, WebP)`);
      if (file.size > 8 * 1024 * 1024) throw new Error(`INVALID: ${file.name} : plus de 8 Mo`);
      const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
      const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const up = await sb.storage.from('listing-media').upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new Error(`INVALID: envoi de ${file.name} impossible (${up.error.message})`);
      await withDb(me.id, (db) => db.query(`insert into public.listing_media (listing_id, kind, storage_path, sort_order)
        values ($1, 'photo', $2, coalesce((select max(sort_order) + 1 from public.listing_media where listing_id = $1), 0))`, [id, path]));
    }
  } catch (e) { err = dbMessage(e); }
  revalidatePath('/', 'layout');
  back(f, lang, err ? { err } : { ok: 'saved' });
}

export async function addVideo(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  const url = str(f, 'url');
  if (!/^https:\/\/\S+$/.test(url)) back(f, lang, { err: 'URL https://… attendue' });
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    await db.query(`insert into public.listing_media (listing_id, kind, storage_path, sort_order)
      values ($1, 'video', $2, coalesce((select max(sort_order) + 1 from public.listing_media where listing_id = $1), 0))`, [str(f, 'id'), url]);
  }));
}

export async function deleteMedia(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  let err: string | null = null;
  try {
    const m = await withDb(me.id, (db) => one<{ kind: string; storage_path: string }>(db,
      `delete from public.listing_media where id = $1 returning kind, storage_path`, [str(f, 'media')]));
    if (m?.kind === 'photo') await (await supabaseServer()).storage.from('listing-media').remove([m.storage_path]);
  } catch (e) { err = dbMessage(e); }
  revalidatePath('/', 'layout');
  back(f, lang, err ? { err } : { ok: 'deleted' });
}

export async function coverMedia(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    await db.query(`update public.listing_media set sort_order = case when id = $2 then 0 else sort_order + 1 end where listing_id = $1`, [str(f, 'id'), str(f, 'media')]);
  }).then(() => revalidatePath('/', 'layout')));
}

// ------------------------------------------------------------------ Hébergement : logements, tarifs, fermetures
export async function saveUnit(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  const unit = str(f, 'unit');
  const vals = [JSON.stringify(i18n(f, 'uname')), num(f, 'max_guests') ?? 2, num(f, 'base_price_night') ?? 0, num(f, 'cleaning_fee') ?? 0,
    num(f, 'min_nights') ?? 1, str(f, 'check_in_time') || '16:00', str(f, 'check_out_time') || '11:00'];
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    if (UUID.test(unit)) await db.query(`update public.accommodation_units set name = $1, max_guests = $2, base_price_night = $3, cleaning_fee = $4,
      min_nights = $5, check_in_time = $6, check_out_time = $7 where id = $8`, [...vals, unit]);
    else await db.query(`insert into public.accommodation_units (listing_id, name, max_guests, base_price_night, cleaning_fee, min_nights, check_in_time, check_out_time)
      values ($8, $1, $2, $3, $4, $5, $6, $7)`, [...vals, str(f, 'id')]);
  }));
}
export async function deleteUnit(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => { await db.query(`delete from public.accommodation_units where id = $1`, [str(f, 'unit')]); }), 'deleted');
}
export async function addRate(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    await db.query(`insert into public.unit_rates (unit_id, period, price_night, min_nights) values ($1, daterange($2::date, $3::date + 1), $4, $5)`,
      [str(f, 'unit'), str(f, 'from'), str(f, 'to'), num(f, 'price_night'), num(f, 'rate_min_nights')]);
  }));
}
export async function deleteRate(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => { await db.query(`delete from public.unit_rates where id = $1`, [str(f, 'rate')]); }), 'deleted');
}
export async function addBlock(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    await db.query(`insert into public.unit_blocks (unit_id, period, source, note) values ($1, daterange($2::date, $3::date + 1), 'manual', $4)`,
      [str(f, 'unit'), str(f, 'from'), str(f, 'to'), str(f, 'note') || null]);
  }));
}
export async function deleteBlock(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => { await db.query(`delete from public.unit_blocks where id = $1 and source = 'manual'`, [str(f, 'block')]); }), 'deleted');
}

// ------------------------------------------------------------------ Excursion : horaires et départs
export async function saveSchedule(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  const days = f.getAll('weekdays').map(Number).filter((d) => d >= 0 && d <= 6);
  if (!days.length) back(f, lang, { err: t(lang, 'ed_days') + ' ?' });
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    await db.query(`insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, child_max_age,
        meeting_point, valid_from, valid_to) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10::date, current_date), coalesce($11::date, current_date + 365))`,
      [str(f, 'id'), days, str(f, 'start_time'), num(f, 'duration_min') ?? 120, num(f, 'capacity') ?? 10, num(f, 'price_adult') ?? 0, num(f, 'price_child'),
        num(f, 'child_max_age'), str(f, 'meeting_point') || null, str(f, 'valid_from') || null, str(f, 'valid_to') || null]);
  }));
}
export async function deleteSchedule(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    await db.query(`delete from public.excursion_slots where schedule_id = $1 and seats_reserved = 0 and starts_at > now()`, [str(f, 'schedule')]);
    await db.query(`update public.excursion_slots set schedule_id = null where schedule_id = $1`, [str(f, 'schedule')]);
    await db.query(`delete from public.excursion_schedules where id = $1`, [str(f, 'schedule')]);
  }), 'deleted');
}
export async function generateSlots(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  let n = 0; let err: string | null = null;
  try {
    n = await withDb(me.id, async (db) => {
      const sch = await rows<{ id: string }>(db, `select id from public.excursion_schedules where listing_id = $1`, [str(f, 'id')]);
      let total = 0;
      for (const s of sch) total += Number((await one<{ n: number }>(db, `select public.generate_slots($1, current_date + 90) as n`, [s.id]))?.n ?? 0);
      return total;
    });
  } catch (e) { err = dbMessage(e); }
  revalidatePath('/', 'layout');
  back(f, lang, err ? { err } : { ok: `slots:${n}` });
}
export async function toggleSlot(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    await db.query(`update public.excursion_slots set status = $2::public.slot_status where id = $1`, [str(f, 'slot'), str(f, 'to') === 'closed' ? 'closed' : 'open']);
  }));
}

// ------------------------------------------------------------------ Prestataire : profil professionnel
export async function saveProvider(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  const pid = str(f, 'provider');
  const legal = { info: str(f, 'legal') };
  const bank = { details: str(f, 'bank') };
  let err: string | null = null;
  try {
    let logoPath: string | null = null;
    const logo = f.get('logo');
    await withDb(me.id, async (db) => {
      const vals = [str(f, 'trade_name'), str(f, 'email') || null, str(f, 'phone') || null, str(f, 'address') || null,
        (str(f, 'country_code') || 'FR').toUpperCase().slice(0, 2), UUID.test(str(f, 'destination_id')) ? str(f, 'destination_id') : null,
        JSON.stringify(i18n(f, 'pdesc')), JSON.stringify(legal), JSON.stringify(bank)];
      if (!vals[0]) throw new Error(`INVALID: ${t(lang, 'pro_trade')} ?`);
      if (UUID.test(pid)) {
        await db.query(`update public.providers set trade_name = $1, email = $2, phone = $3, address = $4, country_code = $5, destination_id = $6,
          description = $7, legal_info = $8, manual_payout_details = $9 where id = $10`, [...vals, pid]);
        if (me.role === 'admin' && ['stripe_connect', 'manual_transfer'].includes(str(f, 'payout_method')))
          await db.query(`update public.providers set payout_method = $2::public.payout_method where id = $1`, [pid, str(f, 'payout_method')]);
      } else {
        await db.query(`insert into public.providers (owner_id, trade_name, email, phone, address, country_code, destination_id, description, legal_info,
          manual_payout_details) values ($10, $1, $2, $3, $4, $5, $6, $7, $8, $9)`, [...vals, me.id]);
      }
    });
    if (logo instanceof File && logo.size > 0) {
      if (!/^image\/(jpeg|png|webp|svg\+xml)$/.test(logo.type) || logo.size > 4 * 1024 * 1024) throw new Error('INVALID: logo : JPG, PNG, WebP ou SVG, 4 Mo maximum');
      const p = await withDb(me.id, (db) => one<{ id: string }>(db, UUID.test(pid) ? `select id from public.providers where id = $1` : `select id from public.providers where owner_id = $1 order by created_at limit 1`, [UUID.test(pid) ? pid : me.id]));
      logoPath = `${p!.id}/logo-${Date.now()}.${logo.type.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg')}`;
      const up = await (await supabaseServer()).storage.from('avatars').upload(logoPath, logo, { contentType: logo.type });
      if (up.error) throw new Error(`INVALID: envoi du logo impossible (${up.error.message})`);
      await withDb(me.id, (db) => db.query(`update public.providers set logo_path = $1 where id = $2`, [logoPath, p!.id]));
    }
  } catch (e) { err = dbMessage(e); }
  back(f, lang, err ? { err } : { ok: 'saved' });
}

export async function replyReview(f: FormData) {
  const { me, lang } = await staff(f, ['provider', 'admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    await db.query(`update public.reviews set provider_reply = $2, replied_at = now() where id = $1`, [str(f, 'review'), str(f, 'reply') || null]);
  }));
}

// ------------------------------------------------------------------ Administration : comptes et prestataires
export async function setUser(f: FormData) {
  const { me, lang } = await staff(f, ['admin']);
  const user = str(f, 'user');
  const role = str(f, 'role'), active = str(f, 'active');
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    await db.query(`select public.admin_set_user($1, $2::public.user_role, $3)`,
      [user, ['client', 'provider', 'admin'].includes(role) ? role : null, active === 'on' ? true : active === 'off' ? false : null]);
  }));
}
export async function deleteUser(f: FormData) {
  const { me, lang } = await staff(f, ['admin']);
  if (f.get('confirm') !== 'on') back(f, lang, { err: t(lang, 'bo_confirmDel') });
  await attempt(f, lang, () => withDb(me.id, async (db) => { await db.query(`select public.admin_delete_user($1)`, [str(f, 'user')]); }), 'deleted');
}
export async function setProviderStatus(f: FormData) {
  const { me, lang } = await staff(f, ['admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    await db.query(`select public.admin_set_provider_status($1, $2::public.provider_status)`, [str(f, 'provider'), str(f, 'status')]);
  }));
}
export async function markPayoutPaid(f: FormData) {
  const { me, lang } = await staff(f, ['admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    await db.query(`select public.admin_mark_payout_paid($1, $2)`, [str(f, 'payout'), str(f, 'reference') || null]);
  }));
}

// ------------------------------------------------------------------ Administration : destinations, catégories, contenus, réglages
export async function saveDestination(f: FormData) {
  const { me, lang } = await staff(f, ['admin']);
  const id = str(f, 'dest');
  let err: string | null = null;
  try {
    const name = i18n(f, 'dname');
    if (!name.fr) throw new Error(`INVALID: ${t(lang, 'ed_needTitle')}`);
    const slug = slugify(str(f, 'slug') || name.fr);
    const vals = [slug, JSON.stringify(name), JSON.stringify(i18n(f, 'ddesc')), (str(f, 'country_code') || 'FR').toUpperCase().slice(0, 2),
      str(f, 'timezone') || 'Europe/Paris', num(f, 'lat') ?? 0, num(f, 'lng') ?? 0, f.get('is_active') === 'on', num(f, 'sort_order') ?? 0];
    const destId = await withDb(me.id, async (db) => {
      if (UUID.test(id)) {
        await db.query(`update public.destinations set slug = $1, name = $2, description = $3, country_code = $4, timezone = $5, lat = $6, lng = $7,
          is_active = $8, sort_order = $9 where id = $10`, [...vals, id]);
        return id;
      }
      return (await one<{ id: string }>(db, `insert into public.destinations (slug, name, description, country_code, timezone, lat, lng, is_active, sort_order)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`, vals))!.id;
    });
    const cover = f.get('cover');
    if (cover instanceof File && cover.size > 0) {
      if (!/^image\/(jpeg|png|webp)$/.test(cover.type) || cover.size > 10 * 1024 * 1024) throw new Error('INVALID: photo : JPG, PNG ou WebP, 10 Mo maximum');
      const path = `destinations/${slug}-${Date.now()}.${cover.type.split('/')[1].replace('jpeg', 'jpg')}`;
      const up = await (await supabaseServer()).storage.from('listing-media').upload(path, cover, { contentType: cover.type });
      if (up.error) throw new Error(`INVALID: envoi de la photo impossible (${up.error.message})`);
      await withDb(me.id, (db) => db.query(`update public.destinations set cover_path = $1 where id = $2`, [path, destId]));
    }
  } catch (e) { err = dbMessage(e); }
  revalidatePath('/', 'layout');
  back(f, lang, err ? { err } : { ok: 'saved' });
}
export async function saveCategory(f: FormData) {
  const { me, lang } = await staff(f, ['admin']);
  const id = str(f, 'cat');
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    const name = i18n(f, 'cname');
    if (!name.fr) throw new Error(`INVALID: ${t(lang, 'ed_needTitle')}`);
    if (/^exp[eé]rience$/i.test(name.fr.trim())) throw new Error('INVALID: pas de catégorie « Expérience » (cahier des charges § 5.D)');
    if (UUID.test(id)) await db.query(`update public.categories set name = $1, sort_order = $2 where id = $3`, [JSON.stringify(name), num(f, 'sort_order') ?? 0, id]);
    else {
      const type = str(f, 'type');
      const parent = await one<{ id: string }>(db, `select id from public.categories where type = $1::public.listing_type and parent_id is null and slug = $1::text`, [type]);
      await db.query(`insert into public.categories (slug, type, parent_id, name, sort_order) values ($1, $2::public.listing_type, $3, $4, $5)`,
        [slugify(name.fr), type, type === 'lieu' ? null : parent?.id ?? null, JSON.stringify(name), num(f, 'sort_order') ?? 50]);
    }
  }).then(() => revalidatePath('/', 'layout')));
}
export async function deleteCategory(f: FormData) {
  const { me, lang } = await staff(f, ['admin']);
  let err: string | null = null;
  try {
    await withDb(me.id, async (db) => {
      if (await one(db, `select 1 from public.categories where id = $1 and slug in ('hebergement','excursion')`, [str(f, 'cat')])) throw new Error('INVALID: catégorie principale');
      // annonces de cette catégorie : déplacées d'abord vers la catégorie choisie (du même type)
      if (await one(db, `select 1 from public.listings where category_id = $1`, [str(f, 'cat')])) {
        const to = str(f, 'move_to');
        const ok = UUID.test(to) && to !== str(f, 'cat') && await one(db, `select 1 from public.categories a join public.categories b on b.type = a.type
          where a.id = $1 and b.id = $2`, [str(f, 'cat'), to]);
        if (!ok) throw new Error(`INVALID: ${t(lang, 'cat_inUse')}`);
        await db.query(`update public.listings set category_id = $2 where category_id = $1`, [str(f, 'cat'), to]);
      }
      await db.query(`update public.categories set parent_id = null where parent_id = $1`, [str(f, 'cat')]);
      await db.query(`delete from public.categories where id = $1`, [str(f, 'cat')]);
    });
  } catch (e) { err = dbMessage(e); }
  revalidatePath('/', 'layout');
  back(f, lang, err ? { err } : { ok: 'deleted' });
}
export async function saveContent(f: FormData) {
  const { me, lang } = await staff(f, ['admin']);
  const key = str(f, 'key');
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    if (!/^(home\.hero|page\.(cgv|mentions|confidentialite))$/.test(key)) throw new Error('INVALID: contenu inconnu');
    const value: Record<string, Record<string, string>> = {};
    for (const l of ['fr', 'en', 'es']) {
      const a: Record<string, string> = key === 'home.hero' ? { title: str(f, `title_${l}`), subtitle: str(f, `subtitle_${l}`) } : { title: str(f, `title_${l}`), body: str(f, `body_${l}`) };
      if (Object.values(a).some(Boolean)) value[l] = a;
    }
    await db.query(`insert into public.site_content (key, value, is_published, updated_by, updated_at) values ($1, $2, $3, $4, now())
      on conflict (key) do update set value = excluded.value, is_published = excluded.is_published, updated_by = excluded.updated_by, updated_at = now()`,
      [key, JSON.stringify(value), f.get('is_published') !== 'off', me.id]);
  }).then(() => revalidatePath('/', 'layout')));
}
export async function saveSettings(f: FormData) {
  const { me, lang } = await staff(f, ['admin']);
  await attempt(f, lang, () => withDb(me.id, async (db) => {
    for (const type of ['hebergement', 'excursion']) {
      const v = num(f, `rate_${type}`);
      if (v === null) continue;
      if (v < 0 || v > 50) throw new Error('INVALID: commission entre 0 et 50 %');
      const cur = await one<{ rate: string }>(db, `select rate::text from public.commission_rates where type = $1::public.listing_type and provider_id is null order by valid_from desc limit 1`, [type]);
      if (!cur || Math.abs(Number(cur.rate) - v / 100) > 1e-6)
        await db.query(`insert into public.commission_rates (type, rate, created_by) values ($1::public.listing_type, $2, $3)`, [type, v / 100, me.id]);
    }
    const set = async (k: string, v: number | null, min: number, max: number) => {
      if (v === null) return;
      if (v < min || v > max) throw new Error(`INVALID: ${k} hors limites`);
      await db.query(`insert into public.settings (key, value) values ($1, to_jsonb($2::numeric)) on conflict (key) do update set value = excluded.value`, [k, v]);
    };
    await set('planner_price', num(f, 'planner_price'), 0, 500);
    await set('planner_free_items', num(f, 'planner_free_items'), 0, 50);
    await set('hold_minutes', num(f, 'hold_minutes'), 10, 120);
    await set('payout_delay_days', num(f, 'payout_delay_days'), 0, 60);
  }));
}
