-- StayNdiscover : mise à jour n°7 (planificateur, phase 1). À coller une seule fois dans Supabase > SQL Editor, puis Run.
begin;
-- =====================================================================
-- StayNdiscover — Migration 7 : séjour complet (cahier des charges du planificateur, phase 1)
-- Complète les tables existantes (trips, trip_items, categories) au lieu d'en créer des doublons.
-- Ajoute trip_days (une ligne par journée : thème, point de départ, itinéraire Google Maps)
-- et travel_times (cache des trajets calculés par Google Routes).
-- =====================================================================

-- ---------- Séjour : toutes les réponses du questionnaire ----------
alter table public.trips
  add column accommodation_mode text not null default 'undecided'
    check (accommodation_mode in ('staynd', 'elsewhere', 'find', 'undecided')),
  add column ext_acc_name      text check (char_length(ext_acc_name) <= 200),
  add column ext_acc_address   text check (char_length(ext_acc_address) <= 500),
  add column ext_acc_lat       double precision check (ext_acc_lat between -90 and 90),
  add column ext_acc_lng       double precision check (ext_acc_lng between -180 and 180),
  add column ext_acc_place_id  text,
  add column ext_check_in      time,
  add column ext_check_out     time,
  add column children_ages     int[] not null default '{}'
    check (cardinality(children_ages) <= 30 and 0 <= all(children_ages) and 17 >= all(children_ages)),
  add column transport_info    text check (char_length(transport_info) <= 1000),
  add column regions           text[] not null default '{}' check (cardinality(regions) <= 20),
  add column preference_keys   text[] not null default '{}' check (preference_keys <@ array[
    'plages','excursions-terrestres','nautique','bateau','plongee','dauphins','randonnees','nature','gastronomie',
    'restaurants','marches','culture','musees','distilleries','famille','sport','spots-photo','points-de-vue','insolite']::text[]),
  add column free_time_min     int not null default 60 check (free_time_min between 0 and 720),
  add column active_weekdays   int[] not null default '{0,1,2,3,4,5,6}' check (active_weekdays <@ array[0,1,2,3,4,5,6]),
  add column budget_scope      text not null default 'group' check (budget_scope in ('group', 'person')),
  add column archived_at       timestamptz,
  add column nights            int generated always as (end_date - start_date) stored;

-- un hébergement StayNdiscover choisi = mode « staynd »
update public.trips set accommodation_mode = 'staynd' where accommodation_id is not null;

-- ---------- Étapes du planning : précisions nécessaires au moteur (phase 3) ----------
alter table public.trip_items
  add column kind          text not null default 'activity' check (kind in ('activity', 'meal', 'free', 'transfer', 'return')),
  add column end_time      time,
  add column adults        int check (adults >= 0),
  add column children      int check (children >= 0),
  add column travel_meters int check (travel_meters >= 0),
  add column travel_mode   text check (travel_mode in ('drive', 'walk', 'bicycle', 'transit', 'boat', 'other')),
  add column status        text not null default 'proposed' check (status in ('proposed', 'confirmed', 'conflict'));

-- ---------- Journées du séjour ----------
create table public.trip_days (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips(id) on delete cascade,
  day              date not null,
  title            text check (char_length(title) <= 200),
  start_label      text,                      -- point de départ s'il diffère de l'hébergement
  start_lat        double precision,
  start_lng        double precision,
  travel_mode      text not null default 'drive' check (travel_mode in ('drive', 'walk', 'bicycle', 'transit')),
  route            jsonb,                     -- segments, distances, durées, liens Google Maps
  route_updated_at timestamptz,
  unique (trip_id, day)
);
alter table public.trip_days enable row level security;
create policy days_own on public.trip_days for all
  using (exists (select 1 from public.trips t where t.id = trip_id and (t.user_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));
grant select, insert, update, delete on public.trip_days to authenticated;

-- ---------- Cache des trajets (Google Routes) : évite de repayer un trajet déjà calculé ----------
create table public.travel_times (
  origin_key  text not null,                 -- « lat,lng » arrondis à 5 décimales, ou place_id
  dest_key    text not null,
  mode        text not null check (mode in ('drive', 'walk', 'bicycle', 'transit')),
  meters      int not null check (meters >= 0),
  seconds     int not null check (seconds >= 0),
  provider    text not null default 'google_routes',
  fetched_at  timestamptz not null default now(),
  primary key (origin_key, dest_key, mode)
);
alter table public.travel_times enable row level security;
create policy travel_read on public.travel_times for select using (auth.uid() is not null);
revoke all on public.travel_times from anon, authenticated;
grant select on public.travel_times to authenticated;
grant all on public.travel_times to service_role;

-- ---------- Archivage d'un séjour ----------
create or replace function public.set_trip_archived(p_trip uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.trips set archived_at = case when p_archived then now() else null end, updated_at = now()
   where id = p_trip and user_id = auth.uid();
  if not found then raise exception 'FORBIDDEN: séjour inconnu'; end if;
end $$;
revoke execute on function public.set_trip_archived(uuid, boolean) from public, anon;
grant execute on function public.set_trip_archived(uuid, boolean) to authenticated;

-- ---------- Catégories demandées par le cahier des charges et absentes jusqu'ici ----------
insert into public.categories (slug, type, parent_id, name, sort_order)
select v.slug, v.type::public.listing_type, (select id from public.categories where slug = v.parent), v.name::jsonb, v.ord
from (values
  ('insolite', 'hebergement', 'hebergement', '{"fr":"Hébergement insolite","en":"Unusual stay","es":"Alojamiento insólito"}', 10),
  ('excursion-terrestre', 'excursion', 'excursion', '{"fr":"Excursion terrestre","en":"Land tour","es":"Excursión terrestre"}', 0),
  ('famille', 'excursion', 'excursion', '{"fr":"Activité familiale","en":"Family activity","es":"Actividad familiar"}', 10)
) v(slug, type, parent, name, ord)
on conflict (slug) do nothing;
insert into public.categories (slug, type, name, sort_order) values
  ('distillerie', 'lieu', '{"fr":"Distillerie","en":"Distillery","es":"Destilería"}', 8),
  ('musee', 'lieu', '{"fr":"Musée et monument","en":"Museum and monument","es":"Museo y monumento"}', 9),
  ('site-naturel', 'lieu', '{"fr":"Site naturel","en":"Natural site","es":"Sitio natural"}', 10)
on conflict (slug) do nothing;

-- ---------- Décision de Marion (8 novembre 2026) : 5 activités gratuites par séjour ----------
-- La création du séjour et les 5 premières activités sont gratuites ; les 19,99 € sont demandés
-- au clic sur « Planifier mon voyage » (ou au-delà de 5 activités).
update public.settings set value = '5' where key = 'planner_free_items';
commit;
