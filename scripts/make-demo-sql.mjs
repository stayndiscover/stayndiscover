// Génère supabase/demo/donnees-demo.sql à partir des données fictives de la maquette.
// Usage : node scripts/make-demo-sql.mjs <chemin vers la maquette index.html>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync(process.argv[2], 'utf8');
const grab = (start, end) => html.slice(html.indexOf(start) + start.length, html.indexOf(end));
const ITEMS = Function('return ' + grab('const BASE_ITEMS=', 'const PROVS=').trim().replace(/;$/, ''))();
const PROVS = Function('return ' + grab('const PROVS=', 'const DAYSN=').trim().replace(/;$/, ''))();

const CAT = { chambre: 'chambre-hotes', saisonniere: 'location-saisonniere', rando_exc: 'randonnee-guidee', visite: 'visite-guidee',
  locale: 'experience-locale', attraction: 'site-attraction', pointdevue: 'point-de-vue', spotphoto: 'spot-photo' };
const TYPE = { villa: 'hebergement', maison: 'hebergement', appartement: 'hebergement', studio: 'hebergement', riad: 'hebergement',
  bungalow: 'hebergement', chambre: 'hebergement', hotel: 'hebergement', saisonniere: 'hebergement' };
const LIEUX = ['restaurant', 'plage', 'randonnee', 'attraction', 'marche', 'pointdevue', 'spotphoto'];
const PROV_DEST = { p1: 'martinique', p2: 'maroc', p3: 'martinique', p4: 'belize' };
const PROV_COUNTRY = { p1: 'FR', p2: 'MA', p3: 'FR', p4: 'BZ' };
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const s = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => (v == null ? 'null' : `${s(JSON.stringify(v))}::jsonb`);
const slugify = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'et')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

let out = `-- =====================================================================
-- StaynDiscover : DONNÉES DE DÉMONSTRATION (fictives, reprises de la maquette)
-- Sert à voir le site rempli et à le tester. À NE PAS garder au lancement réel :
-- supprime-les avec supprimer-demo.sql avant d'ouvrir le site au public.
-- Prérequis : avoir créé ton compte sur le site et l'avoir passé en admin.
-- Les 4 prestataires fictifs sont rattachés à ce compte admin.
-- =====================================================================
do $$
declare v_owner uuid; v_prov uuid; v_list uuid; v_unit uuid; v_sched uuid;
begin
  select id into v_owner from public.profiles where role = 'admin' order by created_at limit 1;
  if v_owner is null then
    raise exception 'Crée d''abord ton compte sur le site, puis passe-le en admin (voir le README).';
  end if;
  if exists (select 1 from public.providers where legal_info->>'demo' = 'true') then
    raise notice 'Les données de démonstration sont déjà installées.';
    return;
  end if;
`;

for (const [key, name] of Object.entries(PROVS)) {
  out += `
  insert into public.providers (owner_id, trade_name, country_code, destination_id, status, payout_method, approved_at, legal_info, description)
  values (v_owner, ${s(name)}, '${PROV_COUNTRY[key]}', (select id from public.destinations where slug = '${PROV_DEST[key]}'),
          'approved', ${PROV_COUNTRY[key] === 'FR' ? "'stripe_connect'" : "'manual_transfer'"}, now(), '{"demo":"true","key":"${key}"}', '{"fr":""}');
`;
}

for (const i of ITEMS) {
  const type = TYPE[i.sub] || (LIEUX.includes(i.sub) ? 'lieu' : 'excursion');
  const cat = CAT[i.sub] || i.sub;
  const slug = slugify(i.n);
  let hours = null;
  if (i.o) {
    hours = {};
    DAYS.forEach((d, k) => { hours[d] = (i.closed || []).includes(k) ? [] : [[hh(i.o[0]), hh(i.o[1])]]; });
  }
  const prov = i.prov ? `(select id from public.providers where legal_info->>'key' = '${i.prov}' and legal_info->>'demo' = 'true')` : 'null';
  out += `
  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (${prov}, (select id from public.destinations where slug = '${i.d}'), (select id from public.categories where slug = '${cat}'),
    '${type}', '${slug}', 'published', ${j({ fr: i.n, en: i.n, es: i.n })}, ${j(i.s)}, ${s(i.a)}, ${i.lat}, ${i.lng},
    ${j(hours)}, ${i.p ?? 'null'}, ${type === 'lieu' && i.dur ? i.dur : 'null'}, ${i.book ? 'true' : 'false'}, ${j(i.tip ?? null)}, ${i.r || 'null'}, v_owner)
  returning id into v_list;
`;
  if (type === 'hebergement') {
    out += `  insert into public.accommodation_units (listing_id, name, max_guests, base_price_night, cleaning_fee, min_nights, check_in_time, check_out_time)
  values (v_list, ${j({ fr: 'Logement entier', en: 'Entire place', es: 'Alojamiento entero' })}, ${i.cap}, ${i.p}, ${Math.round(i.p * 0.25)}, ${i.minN}, '${i.ci}', '${i.co}');
`;
  }
  if (type === 'excursion') {
    for (const h of i.slots) {
      out += `  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{${i.days.join(',')}}', '${hh(h)}', ${i.dur}, ${i.cap}, ${i.p}, ${Math.round(i.p * 0.6)}, ${s(i.a)}, current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);
`;
    }
  }
}

out += `
  -- Quelques nuits déjà prises (comme sur Airbnb) pour voir le calendrier et les refus de dates
  insert into public.unit_blocks (unit_id, period, source, note)
  select u.id, daterange(current_date + 20, current_date + 24), 'manual', 'démo'
    from public.accommodation_units u join public.listings l on l.id = u.listing_id where l.slug = 'villa-bois-lezard';
  raise notice 'Données de démonstration installées : % fiches.', (select count(*) from public.listings);
end $$;
`;

mkdirSync('supabase/demo', { recursive: true });
writeFileSync('supabase/demo/donnees-demo.sql', out);
writeFileSync('supabase/demo/supprimer-demo.sql', `-- Supprime toutes les données de démonstration (prestataires fictifs et leurs fiches, fiches de lieux de la démo)
begin;
delete from public.cart_items where listing_id in (select id from public.listings where created_by is not null and (provider_id in (select id from public.providers where legal_info->>'demo' = 'true') or (provider_id is null and slug in (${ITEMS.filter(i => !i.prov).map(i => s(slugify(i.n))).join(', ')}))));
delete from public.listings where provider_id in (select id from public.providers where legal_info->>'demo' = 'true')
   or (provider_id is null and slug in (${ITEMS.filter(i => !i.prov).map(i => s(slugify(i.n))).join(', ')}));
delete from public.providers where legal_info->>'demo' = 'true';
commit;
`);
console.log('OK', ITEMS.length, 'fiches');
