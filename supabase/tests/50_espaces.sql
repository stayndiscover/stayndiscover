-- =====================================================================
-- Espaces prestataire et administration (migration 8)
-- À lancer après 10_scenarios.sql (comptes admin …0a, client …c1, prestataire …f1 + annonce « villa-bois-lezard »)
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

-- ---------- Un client n'a accès à rien de l'administration ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select pg_temp.must_fail('select * from admin_users()', 'FORBIDDEN', 'liste des comptes refusée à un client');
select pg_temp.must_fail($$select admin_moderate_listing((select id from listings limit 1), 'published', null)$$, 'FORBIDDEN', 'modération refusée à un client');
select pg_temp.must_fail($$select admin_set_provider_status((select id from providers limit 1), 'approved')$$, 'FORBIDDEN', 'validation d''un prestataire refusée à un client');
select pg_temp.must_fail($$select submit_listing((select id from listings where slug = 'villa-bois-lezard'))$$, 'FORBIDDEN', 'un client ne soumet pas l''annonce d''un prestataire');

-- ---------- Prestataire : brouillon puis soumission ----------
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
insert into listings (provider_id, destination_id, category_id, type, slug, status, title, address)
select p.id, d.id, c.id, 'excursion', 'sortie-test-espaces', 'draft', '{"fr":"Sortie test"}', 'Le Marin'
  from providers p, destinations d, categories c where d.slug = 'martinique' and c.slug = 'bateau';
select pg_temp.ok((select status from listings where slug = 'sortie-test-espaces') = 'draft', 'prestataire : annonce gardée en brouillon');
select submit_listing((select id from listings where slug = 'sortie-test-espaces'));
select pg_temp.ok((select status from listings where slug = 'sortie-test-espaces') = 'pending', 'prestataire : annonce soumise à validation');
select pg_temp.must_fail('select * from admin_users()', 'FORBIDDEN', 'liste des comptes refusée à un prestataire');
reset role;
select pg_temp.ok((select count(*) from notifications n join profiles p on p.id = n.user_id
  where p.role = 'admin' and n.kind = 'listing_submitted') >= 1, 'les administrateurs sont prévenus de la soumission');

-- ---------- Administrateur ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select pg_temp.ok((select count(*) from admin_users() where email = 'pro@kaylagon.test' and provider_name = 'Kay Lagon Conciergerie') = 1,
  'admin : liste des comptes avec e-mail et nom commercial');
select admin_moderate_listing((select id from listings where slug = 'sortie-test-espaces'), 'changes_requested', 'Merci d''ajouter 3 photos de meilleure qualité');
reset role;
select pg_temp.ok((select status = 'changes_requested' and moderation_note like 'Merci%' from listings where slug = 'sortie-test-espaces'),
  'admin : demande de photos supplémentaires enregistrée');
select pg_temp.ok((select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000f1' and kind = 'listing_changes_requested') = 1,
  'le prestataire est notifié de la demande');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select admin_moderate_listing((select id from listings where slug = 'sortie-test-espaces'), 'published', null);
select pg_temp.ok((select status = 'published' and published_at is not null and moderation_note is null from listings where slug = 'sortie-test-espaces'),
  'admin : annonce validée et publiée');
select admin_set_provider_status((select id from providers where trade_name = 'Kay Lagon Conciergerie'), 'suspended');
select pg_temp.ok((select status from providers where trade_name = 'Kay Lagon Conciergerie') = 'suspended', 'admin : prestataire suspendu');
select admin_set_provider_status((select id from providers where trade_name = 'Kay Lagon Conciergerie'), 'approved');
select pg_temp.must_fail($$select admin_delete_user('00000000-0000-0000-0000-0000000000f1')$$, 'désactivez', 'suppression refusée pour un compte qui a des annonces');
select pg_temp.must_fail($$select admin_delete_user('00000000-0000-0000-0000-00000000000a')$$, 'propre compte', 'un admin ne supprime pas son propre compte');
update profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.ok((select not is_active from profiles where id = '00000000-0000-0000-0000-0000000000c3'), 'admin : compte désactivé');
update profiles set is_active = true where id = '00000000-0000-0000-0000-0000000000c3';
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d9', 'vide@client.test');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select admin_delete_user('00000000-0000-0000-0000-0000000000d9');
reset role;
select pg_temp.ok(not exists (select 1 from profiles where id = '00000000-0000-0000-0000-0000000000d9'), 'admin : compte sans historique supprimé');
select pg_temp.ok(public.media_path_editable('not-a-uuid/photo.jpg') = false, 'stockage : chemin de photo invalide refusé');
\o
\echo 'OK  espaces prestataire et administration : 18 vérifications'
