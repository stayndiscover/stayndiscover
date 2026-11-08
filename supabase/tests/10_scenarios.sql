-- =====================================================================
-- Scénarios de test StaynDiscover (à lancer après 00_supabase_stub.sql + migrations)
-- Chaque assertion échoue bruyamment ; « OK » = comportement attendu.
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

-- Usurpation d'identité façon Supabase
create or replace function pg_temp.as_user(p uuid) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false) $$;

-- Exécute une requête qui DOIT échouer ; le message doit contenir p_expect
create or replace function pg_temp.must_fail(p_sql text, p_expect text, p_label text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ÉCHEC [%] : la requête aurait dû être refusée', p_label;
exception when others then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
  if position(lower(p_expect) in lower(sqlerrm)) = 0 then
    raise exception 'ÉCHEC [%] : refus inattendu « % »', p_label, sqlerrm;
  end if;
  raise notice 'OK  % → refusé (%)', p_label, left(sqlerrm, 90);
end $$;

create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ÉCHEC [%]', label; end if;
  raise notice 'OK  %', label;
end $$;

-- ---------- Comptes ----------
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'admin@stayndiscover.test', '{"full_name":"Admin","account_type":"admin"}'),
 ('00000000-0000-0000-0000-0000000000c1', 'a@client.test', '{"full_name":"Client A"}'),
 ('00000000-0000-0000-0000-0000000000c2', 'b@client.test', '{"full_name":"Client B","lang":"es"}'),
 ('00000000-0000-0000-0000-0000000000c3', 'c@client.test', '{"full_name":"Client C"}'),
 ('00000000-0000-0000-0000-0000000000f1', 'pro@kaylagon.test', '{"full_name":"Kay Lagon","account_type":"provider"}');
select pg_temp.ok((select role from profiles where id = '00000000-0000-0000-0000-00000000000a') = 'client',
  'inscription : demander « admin » dans les métadonnées ne donne PAS le rôle admin');
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';   -- fait par le propriétaire du projet
select pg_temp.ok((select role from profiles where id = '00000000-0000-0000-0000-0000000000f1') = 'provider', 'inscription prestataire');

-- ---------- Prestataire : inscription et annonce ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
insert into providers (owner_id, trade_name, country_code, status, stripe_account_id)
values ('00000000-0000-0000-0000-0000000000f1', 'Kay Lagon Conciergerie', 'FR', 'approved', 'acct_pirate');
select pg_temp.ok((select status = 'pending' and stripe_account_id is null from providers), 'un prestataire ne peut pas s''auto-valider ni injecter un compte Stripe');

insert into listings (provider_id, destination_id, category_id, type, slug, status, title, address, lat, lng)
select p.id, d.id, c.id, 'hebergement', 'villa-bois-lezard', 'published',
       '{"fr":"Villa Bois-Lézard","en":"Villa Bois-Lézard"}', 'Anse à l''Âne, Les Trois-Îlets', 14.539, -61.036
  from providers p, destinations d, categories c where d.slug = 'martinique' and c.slug = 'villa';
select pg_temp.ok((select status from listings where slug = 'villa-bois-lezard') = 'pending', 'annonce envoyée en validation, pas publiée');
select pg_temp.must_fail($$update listings set status = 'published' where slug = 'villa-bois-lezard'$$, 'FORBIDDEN', 'prestataire qui se publie seul');
select pg_temp.must_fail($$insert into listings (provider_id, destination_id, category_id, type, slug, title)
  select p.id, d.id, c.id, 'hebergement', 'sans-lieu', '{"fr":"x"}' from providers p, destinations d, categories c
  where d.slug='martinique' and c.slug='villa'$$, 'listing_has_location', 'fiche sans aucune localisation');

insert into listings (provider_id, destination_id, category_id, type, slug, title, google_place_id, booking_required)
select p.id, d.id, c.id, 'excursion', 'dauphins-anse-noire', '{"fr":"Dauphins & snorkeling"}', 'ChIJ-test', true
  from providers p, destinations d, categories c where d.slug = 'martinique' and c.slug = 'dauphins';
reset role;

-- Admin : valide le prestataire et publie
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
update providers set status = 'approved', approved_at = now();
update listings set status = 'published';
reset role;
-- (service : Stripe Connect a confirmé le compte)
update providers set stripe_account_id = 'acct_test_1', stripe_charges_enabled = true, stripe_payouts_enabled = true;

-- Prestataire : logement, créneaux d'excursion
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
insert into accommodation_units (listing_id, name, max_guests, base_price_night, cleaning_fee, min_nights)
select id, '{"fr":"Villa entière"}', 6, 240, 60, 3 from listings where slug = 'villa-bois-lezard';
insert into unit_rates (unit_id, period, price_night) select id, '[2027-02-14,2027-02-16)', 300 from accommodation_units;
insert into excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
select id, '{1,3,5}', '09:00', 240, 4, 65, 40, 'Ponton de Case-Pilote', '2027-02-01', '2027-02-28' from listings where slug = 'dauphins-anse-noire';
select pg_temp.ok(public.generate_slots((select id from excursion_schedules)) = 12, 'génération de 12 créneaux lun/mer/ven en février 2027');
select pg_temp.must_fail($$update excursion_slots set seats_reserved = 0$$, 'permission denied', 'prestataire qui modifie les places réservées');
reset role;

-- ---------- Visiteur anonyme ----------
select pg_temp.as_user(null);
set role anon;
select pg_temp.ok((select count(*) from listings) = 2, 'visiteur : voit les 2 annonces publiées');
select pg_temp.ok((select count(*) from providers) = 0, 'visiteur : ne voit pas la table prestataires (Stripe, RIB)');
select pg_temp.ok((select count(*) from provider_cards) = 1, 'visiteur : voit la vitrine publique du prestataire');
select pg_temp.must_fail($$select ical_export_token from accommodation_units$$, 'permission denied', 'visiteur : lien secret iCal');
select pg_temp.ok((select (public.quote_stay(id, '2027-02-10', '2027-02-17', 4)->>'total')::numeric from accommodation_units) = 240*5 + 300*2 + 60,
  'devis : 5 nuits à 240 + 2 nuits saisonnières à 300 + ménage 60 = 1 860');
select pg_temp.must_fail($$select public.quote_stay(id, '2027-02-10', '2027-02-11', 2) from accommodation_units$$, 'minimum', 'séjour sous le minimum de nuits');
select pg_temp.must_fail($$select public.start_checkout()$$, 'permission denied', 'visiteur : paiement sans compte');
reset role;

-- ---------- Client A : favoris, séjour, panier, paiement ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
insert into favorites (user_id, listing_id) select '00000000-0000-0000-0000-0000000000c1', id from listings;
insert into trips (user_id, destination_id, start_date, end_date, arrival_time, departure_time, adults, accommodation_id)
select '00000000-0000-0000-0000-0000000000c1', d.id, '2027-02-10', '2027-02-17', '14:30', '18:00', 2, l.id
  from destinations d, listings l where d.slug = 'martinique' and l.slug = 'villa-bois-lezard';
insert into trips (user_id, destination_id, start_date, end_date) select '00000000-0000-0000-0000-0000000000c1', id, '2027-05-01', '2027-05-08' from destinations where slug = 'maroc';
select pg_temp.ok((select count(*) from trips) = 2, 'client : plusieurs séjours enregistrés');
insert into cart_items (user_id, listing_id, unit_id, start_date, end_date, adults)
select '00000000-0000-0000-0000-0000000000c1', listing_id, id, '2027-02-10', '2027-02-17', 4 from accommodation_units;
insert into cart_items (user_id, listing_id, slot_id, adults, children)
select '00000000-0000-0000-0000-0000000000c1', listing_id, id, 2, 1 from excursion_slots where starts_at::date = '2027-02-12';
select set_config('test.order_a', public.start_checkout()::text, false);
select pg_temp.ok((select total = 1860 + 65*2 + 40 and commission_total = round(1860*0.12,2) + round(170*0.12,2) from orders), 'commande A : total 2 030 €, commission 12 % calculée');
select pg_temp.ok((select bool_and(provider_amount + commission_amount = amount) from bookings), 'part prestataire + commission = montant, pour chaque ligne');
select pg_temp.ok((select seats_reserved from excursion_slots where starts_at::date = '2027-02-12') = 3, 'excursion : 3 places tenues pendant le paiement');
select pg_temp.must_fail($$update orders set total = 1$$, 'permission denied', 'client qui modifie le montant de sa commande');
select pg_temp.must_fail($$update profiles set role = 'admin' where id = auth.uid()$$, 'FORBIDDEN', 'client qui se donne le rôle admin');
reset role;

-- ---------- Client B : tentative de double réservation ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select pg_temp.ok((select count(*) from orders) = 0 and (select count(*) from trips) = 0 and (select count(*) from favorites) = 0,
  'client B : ne voit ni les commandes, ni les séjours, ni les favoris de A');
insert into cart_items (user_id, listing_id, unit_id, start_date, end_date, adults)
select '00000000-0000-0000-0000-0000000000c2', listing_id, id, '2027-02-15', '2027-02-19', 2 from accommodation_units;
select pg_temp.must_fail($$select public.start_checkout()$$, 'UNAVAILABLE', 'double réservation pendant le paiement de A');
select pg_temp.ok((select count(*) from orders) = 0, 'refus = rien n''est tenu ni facturé pour B');
delete from cart_items;
reset role;

-- Filet ultime : même en écrivant directement en base, la contrainte refuse le chevauchement
select pg_temp.must_fail($$insert into bookings (order_id, user_id, provider_id, listing_id, type, unit_id, stay, amount, commission_rate, commission_amount, provider_amount, status)
  select o.id, o.user_id, b.provider_id, b.listing_id, 'hebergement', b.unit_id, '[2027-02-16,2027-02-18)', 100, 0.12, 12, 88, 'confirmed'
  from orders o join bookings b on b.order_id = o.id and b.unit_id is not null$$, 'no_double_booking', 'contrainte d''exclusion en base');

-- ---------- Webhook Stripe : autorisation puis capture ----------
set role service_role;
select pg_temp.ok(public.authorize_order(current_setting('test.order_a')::uuid, 'pi_A', 'evt_1') = 'capture', 'paiement autorisé, dates toujours tenues → capturer');
select pg_temp.ok(public.authorize_order(current_setting('test.order_a')::uuid, 'pi_A', 'evt_1') = 'capture', 'webhook rejoué : réponse identique, rien en double');
select public.mark_order_paid(current_setting('test.order_a')::uuid, 'ch_A', 'evt_2');
select public.mark_order_paid(current_setting('test.order_a')::uuid, 'ch_A', 'evt_2');
reset role;
select pg_temp.ok((select status from orders where id = current_setting('test.order_a')::uuid) = 'paid', 'commande payée');
select pg_temp.ok((select count(*) from bookings where status = 'confirmed') = 2, 'réservations confirmées');
select pg_temp.ok((select count(*) from payouts) = 2 and (select sum(amount) from payouts) = (select sum(provider_amount) from bookings), 'reversements prestataire planifiés, une seule fois');
select pg_temp.ok((select min(scheduled_for) from payouts) = '2027-02-11', 'reversement J+1 après le début (excursion du 12 → 13, séjour du 10 → 11)');
select pg_temp.ok((select count(*) from invoices) = 1 and (select count(*) from cart_items where user_id = '00000000-0000-0000-0000-0000000000c1') = 0, 'facture émise, panier vidé');
select pg_temp.ok((select count(*) from notifications where kind = 'new_booking') = 2 and (select count(*) from notifications where kind = 'booking_confirmed') = 1,
  'notifications : prestataire (×2) et client');

-- ---------- Synchro iCal (Airbnb) ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
insert into calendar_connections (provider_id, listing_id, unit_id, kind, label, ical_url)
select p.id, u.listing_id, u.id, 'ical', 'Airbnb', 'https://www.airbnb.fr/calendar/ical/123.ics?s=secret' from providers p, accommodation_units u;
select pg_temp.ok(public.unit_export_token((select id from accommodation_units)) is not null, 'prestataire : récupère son lien d''export iCal');
reset role;
set role service_role;
select pg_temp.ok((select count(*) from public.connections_due()) = 1, 'connexion à synchroniser détectée');
select pg_temp.ok((public.apply_ical_sync((select id from calendar_connections),
  '[{"uid":"air-1","start":"2027-03-01","end":"2027-03-05"},{"uid":"air-2","start":"2027-02-16","end":"2027-02-18"}]')->'conflicts'->0->>'external') is not null,
  'iCal : conflit détecté (Airbnb a vendu des nuits déjà réservées sur StaynDiscover)');
select pg_temp.ok((select count(*) from notifications where kind = 'calendar_conflict') = 2, 'alerte conflit : prestataire + admin');
select pg_temp.ok((public.apply_ical_sync((select id from calendar_connections), '[{"uid":"air-1","start":"2027-03-01","end":"2027-03-05"}]')->>'removed')::int = 1,
  'iCal : une annulation Airbnb libère les dates au passage suivant');
select public.record_sync_error((select id from calendar_connections), 'HTTP 503'), public.record_sync_error((select id from calendar_connections), 'HTTP 503'),
       public.record_sync_error((select id from calendar_connections), 'HTTP 503');
select pg_temp.ok((select count(*) from notifications where kind = 'sync_error') = 2, 'alerte après 3 échecs de synchro d''affilée');
select pg_temp.ok(position('DTSTART;VALUE=DATE:20270210' in public.ical_feed((select ical_export_token from accommodation_units))) > 0, 'export iCal : la réservation StaynDiscover apparaît');
select pg_temp.ok(position('20270301' in public.ical_feed((select ical_export_token from accommodation_units))) = 0, 'export iCal : les blocages Airbnb ne sont pas renvoyés (pas de boucle)');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
insert into cart_items (user_id, listing_id, unit_id, start_date, end_date, adults)
select '00000000-0000-0000-0000-0000000000c2', listing_id, id, '2027-03-02', '2027-03-06', 2 from accommodation_units;
select pg_temp.must_fail($$select public.start_checkout()$$, 'UNAVAILABLE', 'dates bloquées par Airbnb refusées');
select pg_temp.ok((select count(*) from public.get_unit_busy_nights((select id from accommodation_units), '2027-02-28', '2027-03-07')) = 4,
  'calendrier public : 4 nuits occupées affichées, sans le motif');
delete from cart_items;

-- ---------- Capacité d'excursion ----------
insert into cart_items (user_id, listing_id, slot_id, adults) select '00000000-0000-0000-0000-0000000000c2', listing_id, id, 2 from excursion_slots where starts_at::date = '2027-02-12';
select pg_temp.must_fail($$select public.start_checkout()$$, 'plus que 1 places', 'excursion : 2 places demandées, 1 restante');
update cart_items set adults = 1;
select set_config('test.order_b', public.start_checkout()::text, false);
select pg_temp.ok(public.slot_seats_left((select id from excursion_slots where starts_at::date = '2027-02-12')) = 0, 'excursion complète : 0 place restante');
reset role;

-- B abandonne le paiement : la tenue expire et la place est rendue
update bookings set hold_expires_at = now() - interval '1 minute' where order_id = current_setting('test.order_b')::uuid;
set role service_role;
select public.release_expired_holds();
select pg_temp.ok(public.slot_seats_left((select id from excursion_slots where starts_at::date = '2027-02-12')) = 1, 'tenue expirée : la place est libérée');
select pg_temp.ok(public.authorize_order(current_setting('test.order_b')::uuid, 'pi_B', 'evt_3') = 'cancel',
  'paiement arrivé trop tard → autorisation annulée, rien n''est encaissé');
reset role;

-- ---------- Annulation et remboursement ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select pg_temp.ok(public.cancel_booking((select id from bookings where type = 'excursion' and status = 'confirmed'), 'changement de programme') = 170,
  'annulation > 48 h : remboursement intégral de 170 €');
select pg_temp.ok((select status from orders where id = current_setting('test.order_a')::uuid) = 'partially_refunded', 'commande partiellement remboursée');
select pg_temp.must_fail($$insert into reviews (booking_id, listing_id, user_id, rating, body) select id, listing_id, user_id, 5, 'Super' from bookings where type = 'hebergement'$$,
  'FORBIDDEN', 'avis avant la fin du séjour');
reset role;
select pg_temp.ok((select p.amount from payouts p join bookings b on b.id = p.booking_id where b.type = 'excursion') = 0, 'reversement prestataire annulé au prorata');
select pg_temp.ok((select count(*) from refunds where status = 'pending' and amount = 170) = 1, 'remboursement en attente d''exécution Stripe');
select pg_temp.ok(public.slot_seats_left((select id from excursion_slots where starts_at::date = '2027-02-12')) = 4 - 0, 'places de l''excursion annulée rendues');

-- ---------- Prestataire : voit ses réservations, pas celles des autres ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select pg_temp.ok((select count(*) from bookings) >= 2 and (select count(*) from payments) = 0, 'prestataire : voit ses réservations, pas les paiements Stripe');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select pg_temp.ok((select count(*) from audit_log) >= 3, 'admin : journal des opérations lisible');
insert into commission_rates (type, rate) values ('excursion', 0.10);
select pg_temp.ok(public.commission_rate_for('excursion', null) = 0.10, 'admin : taux de commission modifié à 10 %');
reset role;

\echo '==> Tous les scénarios sont passés.'
