-- =====================================================================
-- Planificateur : essai gratuit puis déblocage payant (migration 6)
-- À lancer après 10_scenarios.sql (réutilise ses comptes et ses annonces)
-- =====================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
create or replace function pg_temp.as_user(p uuid) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false) $$;
create or replace function pg_temp.must_fail(p_sql text, p_expect text, p_label text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ÉCHEC [%] : la requête aurait dû être refusée', p_label;
exception when others then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
  if position(lower(p_expect) in lower(sqlerrm)) = 0 then raise exception 'ÉCHEC [%] : refus inattendu « % »', p_label, sqlerrm; end if;
  raise notice 'OK  % → refusé (%)', p_label, left(sqlerrm, 80);
end $$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ÉCHEC [%]', label; end if;
  raise notice 'OK  %', label;
end $$;

-- Ces scénarios testent le mécanisme avec une limite de 3 (la migration 7 la porte à 5 ; on la remet ensuite)
select set_config('test.free_items_before', (select value::text from settings where key = 'planner_free_items'), false);
update settings set value = '3' where key = 'planner_free_items';

-- 4 lieux de plus en Martinique (pour dépasser l'essai gratuit)
insert into listings (destination_id, category_id, type, slug, status, title, google_place_id)
select d.id, c.id, 'lieu', 'lieu-test-' || n, 'published', jsonb_build_object('fr', 'Lieu ' || n), 'ChIJ-' || n
  from destinations d, categories c, generate_series(1, 4) n where d.slug = 'martinique' and c.slug = 'plage';

select pg_temp.ok((select public.setting_num('planner_price', 0)) = 19.99 and public.setting_num('planner_free_items', 0) = 3,
  'réglages : 19,99 € et limite d''essai appliquée');

-- Client C : crée un séjour et ajoute des activités
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
set role authenticated;
insert into trips (user_id, destination_id, start_date, end_date) select '00000000-0000-0000-0000-0000000000c3', id, '2027-06-01', '2027-06-08' from destinations where slug = 'martinique';
insert into trip_items (trip_id, listing_id) select t.id, l.id from trips t, listings l where l.slug in ('lieu-test-1', 'lieu-test-2', 'dauphins-anse-noire');
select pg_temp.ok((public.planner_status((select id from trips))->>'used')::int = 3 and not (public.planner_status((select id from trips))->>'unlocked')::boolean,
  'essai : 3 activités ajoutées gratuitement, planificateur non débloqué');
select pg_temp.must_fail($$insert into trip_items (trip_id, listing_id) select t.id, l.id from trips t, listings l where l.slug = 'lieu-test-3'$$,
  'PAYWALL', '4e activité refusée tant que le séjour n''est pas débloqué');
select pg_temp.ok((select count(*) from trip_items) = 3, 'la sélection déjà faite est conservée');
delete from trip_items where listing_id = (select id from listings where slug = 'lieu-test-2');
insert into trip_items (trip_id, listing_id) select t.id, l.id from trips t, listings l where l.slug = 'lieu-test-3';
select pg_temp.ok((select count(*) from trip_items) = 3, 'retirer une activité libère une place dans l''essai');

select set_config('test.unlock', public.request_planner_unlock((select id from trips))::text, false);
select pg_temp.ok(public.request_planner_unlock((select id from trips))::text = current_setting('test.unlock'), 'demande de déblocage : une seule demande en attente');
select pg_temp.ok((select amount = 19.99 and status = 'pending' from planner_unlocks), 'demande à 19,99 €, en attente de paiement');
select pg_temp.must_fail($$update planner_unlocks set status = 'paid'$$, 'permission denied', 'client qui se déclare payé lui-même');
select pg_temp.must_fail($$insert into planner_unlocks (trip_id, user_id, amount, status) select id, user_id, 0, 'paid' from trips$$, 'permission denied', 'client qui crée un déblocage gratuit');
select pg_temp.must_fail($$select public.mark_planner_unlock_paid(current_setting('test.unlock')::uuid)$$, 'permission denied', 'client qui appelle la confirmation de paiement');
reset role;

-- Client B : ne voit pas les déblocages de C et ne peut pas en demander pour lui
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select pg_temp.ok((select count(*) from planner_unlocks) = 0, 'client B ne voit pas les déblocages de C');
select pg_temp.must_fail($$select public.request_planner_unlock((select id from trips where user_id = '00000000-0000-0000-0000-0000000000c3'))$$, 'FORBIDDEN', 'client B qui demande un déblocage sur le séjour de C');
reset role;

-- Webhook Stripe (service) : paiement confirmé
set role service_role;
select pg_temp.ok(public.mark_planner_unlock_paid(current_setting('test.unlock')::uuid, 'cs_test', 'pi_test'), 'paiement confirmé');
select pg_temp.ok(public.mark_planner_unlock_paid(current_setting('test.unlock')::uuid, 'cs_test', 'pi_test'), 'webhook rejoué : sans effet');
reset role;
select pg_temp.ok((select count(*) from planner_unlocks where status = 'paid') = 1 and (select count(*) from notifications where kind = 'planner_unlocked') = 1,
  'un seul déblocage payé, une notification');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
set role authenticated;
insert into trip_items (trip_id, listing_id) select t.id, l.id from trips t, listings l where l.slug in ('lieu-test-2', 'lieu-test-4', 'villa-bois-lezard');
select pg_temp.ok((select count(*) from trip_items) = 6 and (public.planner_status((select id from trips))->>'unlocked')::boolean,
  'séjour débloqué : activités illimitées');
-- Un autre séjour du même client reste en essai gratuit (le déblocage est par séjour)
insert into trips (user_id, destination_id, start_date, end_date) select '00000000-0000-0000-0000-0000000000c3', id, '2027-09-01', '2027-09-05' from destinations where slug = 'martinique';
select pg_temp.ok(not (public.planner_status((select id from trips where start_date = '2027-09-01'))->>'unlocked')::boolean, 'déblocage valable pour ce séjour seulement');
-- Création d'un séjour : les favoris rejoignent le séjour même au-delà de l'essai (sélection jamais perdue)
select set_config('stayndiscover.trip_creation', 'on', false);
insert into trip_items (trip_id, listing_id) select t.id, l.id from trips t, listings l where t.start_date = '2027-09-01' and l.slug like 'lieu-test-%';
select set_config('stayndiscover.trip_creation', '', false);
select pg_temp.ok((select count(*) from trip_items i join trips t on t.id = i.trip_id where t.start_date = '2027-09-01') = 4, 'création : 4 favoris repris malgré la limite de 3');
reset role;

update settings set value = current_setting('test.free_items_before')::jsonb where key = 'planner_free_items';
\echo '==> Planificateur : tous les scénarios sont passés.'
