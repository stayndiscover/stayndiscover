-- =====================================================================
-- Séjour complet (migration 7) : questionnaire, journées, archivage, catégories
-- À lancer après 10_scenarios.sql et 30_planificateur.sql
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

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
set role authenticated;
insert into trips (user_id, destination_id, title, start_date, end_date, adults, children, children_ages, accommodation_mode,
                   ext_acc_name, ext_acc_address, ext_acc_lat, ext_acc_lng, ext_check_in, ext_check_out,
                   preference_keys, free_time_min, active_weekdays, budget, budget_scope, transport_info, regions)
select '00000000-0000-0000-0000-0000000000c3', id, 'Martinique en famille (séjour fictif de test)', '2027-07-01', '2027-07-08', 2, 2, '{6,11}', 'elsewhere',
       'Gîte Bord de Mer', 'Sainte-Anne, Martinique', 14.44, -60.88, '15:00', '10:00',
       '{plages,plongee,restaurants,famille}', 90, '{1,2,3,4,5,6}', 2500, 'group', 'Vol AF arrivée 13h05 à Fort-de-France', '{Sud,Nord Caraïbe}'
  from destinations where slug = 'martinique';
select pg_temp.ok((select nights = 7 and accommodation_mode = 'elsewhere' and children_ages = '{6,11}' and 'plongee' = any(preference_keys)
  from trips where title like 'Martinique en famille%'), 'séjour complet enregistré : 7 nuits calculées, hébergement extérieur, âges, préférences');
select pg_temp.must_fail($$update trips set preference_keys = '{casino}' where title like 'Martinique en famille%'$$, 'check', 'préférence inconnue refusée');
select pg_temp.must_fail($$update trips set children_ages = '{25}' where title like 'Martinique en famille%'$$, 'check', 'âge d''enfant > 17 refusé');
select pg_temp.must_fail($$update trips set accommodation_mode = 'peut-etre' where title like 'Martinique en famille%'$$, 'check', 'mode d''hébergement inconnu refusé');
insert into trip_days (trip_id, day, title) select id, '2027-07-02', 'Découverte du Sud' from trips where title like 'Martinique en famille%';
select pg_temp.ok((select count(*) from trip_days) = 1, 'journée de séjour enregistrée');
select public.set_trip_archived((select id from trips where title like 'Martinique en famille%'), true);
select pg_temp.ok((select archived_at is not null from trips where title like 'Martinique en famille%'), 'séjour archivé');
select public.set_trip_archived((select id from trips where title like 'Martinique en famille%'), false);
select set_config('test.trip_c', (select id::text from trips where title like 'Martinique en famille%'), false);
select pg_temp.ok((select archived_at is null from trips where title like 'Martinique en famille%'), 'séjour désarchivé');
select pg_temp.must_fail($$insert into travel_times (origin_key, dest_key, mode, meters, seconds) values ('a','b','drive',1,1)$$, 'permission denied', 'client qui écrit un faux temps de trajet');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select pg_temp.ok((select count(*) from trip_days) = 0, 'client B ne voit pas les journées de C');
select pg_temp.must_fail($$select public.set_trip_archived(current_setting('test.trip_c')::uuid, true)$$, 'FORBIDDEN', 'client B qui archive le séjour de C (identifiant connu)');
select pg_temp.must_fail($$insert into trip_days (trip_id, day) values (current_setting('test.trip_c')::uuid, '2027-07-03')$$, 'row-level security', 'client B qui ajoute une journée au séjour de C (identifiant connu)');
reset role;

set role anon;
select pg_temp.ok(public.setting_num('planner_free_items', 0) = 5, '5 activités gratuites par séjour (décision de Marion)');
select pg_temp.ok((select count(*) from categories where slug in ('distillerie','musee','site-naturel','famille','excursion-terrestre','insolite')) = 6,
  'les 6 catégories demandées existent et sont visibles');
reset role;

\echo '==> Séjour complet : tous les scénarios sont passés.'
