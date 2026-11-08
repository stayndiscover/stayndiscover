-- =====================================================================
-- StayNdiscover — Migration 3/4 : sécurité par rôle (Row Level Security)
-- Règle générale : tout est fermé, puis on ouvre précisément.
--   anon          = visiteur non connecté (lecture du catalogue publié)
--   authenticated = client / prestataire / admin (selon profiles.role)
--   service_role  = Edge Functions (Stripe, synchro) : contourne la RLS
-- Les écritures sensibles (commandes, réservations, paiements, reversements)
-- ne passent JAMAIS par l'API directe : uniquement par les fonctions de la migration 2.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','destinations','providers','categories','listings','listing_media','accommodation_units','unit_rates',
    'unit_blocks','excursion_schedules','excursion_slots','favorites','trips','trip_items','cart_items','orders',
    'commission_rates','bookings','payments','refunds','payouts','invoices','calendar_connections','sync_runs',
    'reviews','notifications','site_content','settings','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- Profils ----------
create policy profiles_self_read   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update using (id = auth.uid() or public.is_admin());
create policy profiles_admin_del   on public.profiles for delete using (public.is_admin());

-- ---------- Catalogue public ----------
create policy dest_read   on public.destinations for select using (is_active or public.is_admin());
create policy dest_admin  on public.destinations for all    using (public.is_admin()) with check (public.is_admin());
create policy cat_read    on public.categories   for select using (true);
create policy cat_admin   on public.categories   for all    using (public.is_admin()) with check (public.is_admin());

create policy listings_read on public.listings for select using (
  status = 'published' or public.is_admin() or provider_id in (select public.my_provider_ids()));
create policy listings_provider_insert on public.listings for insert
  with check (public.is_admin() or provider_id in (select public.my_provider_ids()));
create policy listings_provider_update on public.listings for update
  using (public.is_admin() or provider_id in (select public.my_provider_ids()));
create policy listings_admin_delete on public.listings for delete using (public.is_admin());

-- Contenus rattachés à une annonce : lecture si l'annonce est lisible, écriture par son prestataire ou l'admin
create or replace function public.can_edit_listing(p_listing uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.listings
    where id = p_listing and provider_id in (select public.my_provider_ids()))
$$;
create or replace function public.can_read_listing(p_listing uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.listings where id = p_listing and status = 'published') or public.can_edit_listing(p_listing)
$$;
grant execute on function public.can_edit_listing(uuid), public.can_read_listing(uuid) to anon, authenticated;

create policy media_read  on public.listing_media for select using (public.can_read_listing(listing_id));
create policy media_write on public.listing_media for all using (public.can_edit_listing(listing_id)) with check (public.can_edit_listing(listing_id));

create policy units_read  on public.accommodation_units for select using (public.can_read_listing(listing_id));
create policy units_write on public.accommodation_units for all using (public.can_edit_listing(listing_id)) with check (public.can_edit_listing(listing_id));
-- le jeton d'export iCal reste privé : lecture colonne par colonne, sans le jeton
revoke select on public.accommodation_units from anon, authenticated;
grant select (id, listing_id, name, max_guests, base_price_night, cleaning_fee, min_nights, check_in_time, check_out_time, is_active, created_at)
  on public.accommodation_units to anon, authenticated;
create or replace function public.unit_export_token(p_unit uuid) returns text
language sql stable security definer set search_path = public as $$
  select ical_export_token from public.accommodation_units u where u.id = p_unit and public.can_edit_listing(u.listing_id)
$$;
grant execute on function public.unit_export_token(uuid) to authenticated;

create policy rates_read  on public.unit_rates for select using (
  public.can_read_listing((select listing_id from public.accommodation_units u where u.id = unit_id)));
create policy rates_write on public.unit_rates for all
  using (public.can_edit_listing((select listing_id from public.accommodation_units u where u.id = unit_id)))
  with check (public.can_edit_listing((select listing_id from public.accommodation_units u where u.id = unit_id)));

-- Blocages : privés (le public passe par get_unit_busy_nights, qui ne dit pas pourquoi)
create policy blocks_owner on public.unit_blocks for all
  using (public.can_edit_listing((select listing_id from public.accommodation_units u where u.id = unit_id)))
  with check (source = 'manual' and public.can_edit_listing((select listing_id from public.accommodation_units u where u.id = unit_id)));

create policy sched_read  on public.excursion_schedules for select using (public.can_read_listing(listing_id));
create policy sched_write on public.excursion_schedules for all using (public.can_edit_listing(listing_id)) with check (public.can_edit_listing(listing_id));
create policy slots_read  on public.excursion_slots for select using (public.can_read_listing(listing_id));
-- le prestataire ouvre/ferme ses créneaux ; seats_reserved n'est modifié que par les fonctions de paiement
create policy slots_write on public.excursion_slots for all using (public.can_edit_listing(listing_id)) with check (public.can_edit_listing(listing_id));
revoke insert, update on public.excursion_slots from anon, authenticated;
grant insert (listing_id, schedule_id, starts_at, ends_at, capacity, price_adult, price_child, meeting_point, status)
  on public.excursion_slots to authenticated;
grant update (starts_at, ends_at, capacity, price_adult, price_child, meeting_point, status, updated_at)
  on public.excursion_slots to authenticated;

-- ---------- Prestataires ----------
-- La table complète (Stripe, RIB, infos légales) n'est lisible que par son propriétaire et l'admin.
create policy providers_owner_read   on public.providers for select using (owner_id = auth.uid() or public.is_admin());
create policy providers_owner_insert on public.providers for insert with check (owner_id = auth.uid() and public.my_role() = 'provider');
create policy providers_owner_update on public.providers for update using (owner_id = auth.uid() or public.is_admin());
create policy providers_admin_delete on public.providers for delete using (public.is_admin());
-- Vue publique : uniquement les informations vitrine des prestataires validés
create view public.provider_cards as
  select id, trade_name, logo_path, description, destination_id from public.providers where status = 'approved';
grant select on public.provider_cards to anon, authenticated;

-- ---------- Espace voyageur (strictement personnel) ----------
create policy fav_own   on public.favorites  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy trips_own on public.trips      for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid());
create policy items_own on public.trip_items for all
  using (exists (select 1 from public.trips t where t.id = trip_id and (t.user_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));
create policy cart_own  on public.cart_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Commandes, réservations, argent : lecture seule via l'API ----------
create policy orders_read on public.orders for select using (user_id = auth.uid() or public.is_admin());
create policy bookings_read on public.bookings for select using (
  user_id = auth.uid() or provider_id in (select public.my_provider_ids()) or public.is_admin());
create policy payments_admin on public.payments for select using (public.is_admin());
create policy refunds_read on public.refunds for select using (
  public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy payouts_read on public.payouts for select using (provider_id in (select public.my_provider_ids()) or public.is_admin());
-- l'admin marque un virement manuel comme effectué (Maroc, Belize)
create policy payouts_admin_update on public.payouts for update using (public.is_admin()) with check (public.is_admin());
create policy invoices_read on public.invoices for select using (
  public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

create policy rates_public_read on public.commission_rates for select using (true);
create policy rates_admin_write on public.commission_rates for insert with check (public.is_admin());

-- ---------- Calendriers externes ----------
create policy conn_owner on public.calendar_connections for all
  using (provider_id in (select public.my_provider_ids()) or public.is_admin())
  with check (provider_id in (select public.my_provider_ids()) or public.is_admin());
create policy runs_owner on public.sync_runs for select using (
  public.is_admin() or exists (select 1 from public.calendar_connections c
     where c.id = connection_id and c.provider_id in (select public.my_provider_ids())));

-- ---------- Avis ----------
create policy reviews_read   on public.reviews for select using (is_visible or user_id = auth.uid() or public.is_admin()
  or listing_id in (select id from public.listings where provider_id in (select public.my_provider_ids())));
create policy reviews_insert on public.reviews for insert with check (auth.uid() is not null);
create policy reviews_update on public.reviews for update using (
  user_id = auth.uid() or public.is_admin()
  or listing_id in (select id from public.listings where provider_id in (select public.my_provider_ids())));

-- ---------- Divers ----------
create policy notif_own      on public.notifications for select using (user_id = auth.uid());
create policy notif_mark     on public.notifications for update using (user_id = auth.uid());
create policy content_read   on public.site_content  for select using (is_published or public.is_admin());
create policy content_admin  on public.site_content  for all using (public.is_admin()) with check (public.is_admin());
create policy settings_read  on public.settings      for select using (true);
create policy settings_admin on public.settings      for all using (public.is_admin()) with check (public.is_admin());
create policy audit_admin    on public.audit_log     for select using (public.is_admin());

-- Les colonnes d'argent et de statut des commandes ne sont jamais modifiables par l'API
revoke insert, update, delete on public.orders, public.bookings, public.payments, public.refunds, public.invoices, public.audit_log
  from anon, authenticated;
revoke insert, update, delete on public.payouts from anon;
