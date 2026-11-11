-- =====================================================================
-- Migration 8 : espaces prestataire et administration (cahier des charges § 4.C et § 5)
-- - droits d'envoi des photos et vidéos d'annonces (stockage « listing-media ») ;
-- - fonctions réservées à l'administration : liste des comptes avec e-mail, suppression d'un compte,
--   modération des annonces (avec notification au prestataire), validation des prestataires ;
-- - soumission d'une annonce à validation par le prestataire (avec notification aux administrateurs).
-- Aucune table nouvelle : tout s'appuie sur le schéma existant.
-- =====================================================================

-- ---------- Stockage : photos et vidéos des annonces ----------
-- Chemin d'un fichier : <id de l'annonce>/<nom>. Écriture par le prestataire de l'annonce ou un administrateur.
create or replace function public.media_path_editable(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$'
              then public.can_edit_listing(split_part(p_name, '/', 1)::uuid)
              when split_part(p_name, '/', 1) = 'destinations' then public.is_admin()   -- photos de couverture des destinations
              else false end
$$;
-- Logo d'un prestataire : bucket « avatars », chemin <id du prestataire>/<nom>
create or replace function public.logo_path_editable(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$'
         and split_part(p_name, '/', 1)::uuid in (select public.my_provider_ids()))
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    execute 'drop policy if exists sd_listing_media_read on storage.objects';
    execute 'drop policy if exists sd_listing_media_insert on storage.objects';
    execute 'drop policy if exists sd_listing_media_update on storage.objects';
    execute 'drop policy if exists sd_listing_media_delete on storage.objects';
    execute $p$create policy sd_listing_media_read on storage.objects for select using (bucket_id = 'listing-media')$p$;
    execute $p$create policy sd_listing_media_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'listing-media' and public.media_path_editable(name))$p$;
    execute $p$create policy sd_listing_media_update on storage.objects for update to authenticated
      using (bucket_id = 'listing-media' and public.media_path_editable(name))$p$;
    execute $p$create policy sd_listing_media_delete on storage.objects for delete to authenticated
      using (bucket_id = 'listing-media' and public.media_path_editable(name))$p$;
    execute 'drop policy if exists sd_logo_read on storage.objects';
    execute 'drop policy if exists sd_logo_insert on storage.objects';
    execute 'drop policy if exists sd_logo_delete on storage.objects';
    execute $p$create policy sd_logo_read on storage.objects for select using (bucket_id = 'avatars')$p$;
    execute $p$create policy sd_logo_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and public.logo_path_editable(name))$p$;
    execute $p$create policy sd_logo_delete on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and public.logo_path_editable(name))$p$;
  end if;
end $$;

-- ---------- Administration : comptes ----------
create or replace function public.admin_users()
returns table (id uuid, email text, role public.user_role, full_name text, phone text, is_active boolean,
               created_at timestamptz, last_sign_in_at timestamptz, provider_name text, provider_status public.provider_status)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: réservé à l''administration'; end if;
  return query
    select p.id, u.email::text, p.role, p.full_name, p.phone, p.is_active, p.created_at, u.last_sign_in_at,
           pr.trade_name, pr.status
      from public.profiles p join auth.users u on u.id = p.id
      left join lateral (select x.trade_name, x.status from public.providers x where x.owner_id = p.id order by x.created_at limit 1) pr on true
     order by p.created_at desc;
end $$;

-- Suppression d'un compte « selon les règles applicables » : impossible s'il a des commandes ou des annonces
-- (les données comptables doivent être conservées) ; dans ce cas, on le désactive.
create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: réservé à l''administration'; end if;
  if p_user = auth.uid() then raise exception 'INVALID: vous ne pouvez pas supprimer votre propre compte'; end if;
  if exists (select 1 from public.orders where user_id = p_user)
     or exists (select 1 from public.providers pr join public.listings l on l.provider_id = pr.id where pr.owner_id = p_user) then
    raise exception 'INVALID: ce compte a des commandes ou des annonces : désactivez-le plutôt (les données doivent être conservées)';
  end if;
  delete from public.providers where owner_id = p_user;
  delete from auth.users where id = p_user;
  perform public.audit('user.delete', 'profiles', p_user, '{}'::jsonb);
end $$;

-- Rôle et état d'un compte (journalisés)
create or replace function public.admin_set_user(p_user uuid, p_role public.user_role, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: réservé à l''administration'; end if;
  if p_user = auth.uid() then raise exception 'INVALID: modifiez un autre compte que le vôtre'; end if;
  update public.profiles set role = coalesce(p_role, role), is_active = coalesce(p_active, is_active) where id = p_user;
  perform public.audit('user.update', 'profiles', p_user, jsonb_build_object('role', p_role, 'active', p_active));
end $$;

-- Reversement manuel (Maroc, Belize : virement) marqué comme effectué, avec sa référence
create or replace function public.admin_mark_payout_paid(p_payout uuid, p_ref text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: réservé à l''administration'; end if;
  update public.payouts set status = 'paid', paid_at = now(), manual_reference = nullif(trim(coalesce(p_ref, '')), '')
   where id = p_payout and status in ('pending','scheduled','failed');
  perform public.audit('payout.manual', 'payouts', p_payout, jsonb_build_object('ref', p_ref));
end $$;

-- ---------- Administration : prestataires ----------
create or replace function public.admin_set_provider_status(p_provider uuid, p_status public.provider_status) returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: réservé à l''administration'; end if;
  update public.providers set status = p_status,
         approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end
   where id = p_provider returning owner_id into v_owner;
  if v_owner is null then raise exception 'INVALID: prestataire introuvable'; end if;
  perform public.notify(v_owner, 'provider_' || p_status::text, jsonb_build_object('provider', p_provider));
  perform public.audit('provider.status', 'providers', p_provider, jsonb_build_object('status', p_status));
end $$;

-- ---------- Administration : modération des annonces ----------
-- p_status : published, refused, changes_requested, archived, draft, pending
create or replace function public.admin_moderate_listing(p_listing uuid, p_status public.listing_status, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_title jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN: réservé à l''administration'; end if;
  update public.listings set status = p_status, moderation_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_listing returning title into v_title;
  if v_title is null then raise exception 'INVALID: annonce introuvable'; end if;
  select pr.owner_id into v_owner from public.listings l join public.providers pr on pr.id = l.provider_id where l.id = p_listing;
  if v_owner is not null then
    perform public.notify(v_owner, 'listing_' || p_status::text,
      jsonb_build_object('listing', p_listing, 'title', v_title, 'note', p_note));
  end if;
  perform public.audit('listing.moderate', 'listings', p_listing, jsonb_build_object('status', p_status, 'note', p_note));
end $$;

-- ---------- Nouvelle inscription professionnelle : les administrateurs sont prévenus ----------
create or replace function public.on_provider_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admins('provider_signup', jsonb_build_object('provider', new.id, 'name', new.trade_name));
  return new;
end $$;
drop trigger if exists trg_provider_created on public.providers;
create trigger trg_provider_created after insert on public.providers for each row execute function public.on_provider_created();

-- ---------- Prestataire : soumettre une annonce à validation ----------
create or replace function public.submit_listing(p_listing uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_title jsonb; v_status public.listing_status;
begin
  if not exists (select 1 from public.listings where id = p_listing and provider_id in (select public.my_provider_ids())) then
    raise exception 'FORBIDDEN: annonce d''un autre prestataire';
  end if;
  select status, title into v_status, v_title from public.listings where id = p_listing;
  if v_status = 'published' then raise exception 'INVALID: cette annonce est déjà en ligne'; end if;
  update public.listings set status = 'pending' where id = p_listing;
  perform public.notify_admins('listing_submitted', jsonb_build_object('listing', p_listing, 'title', v_title));
end $$;

-- ---------- Adresse de page libre (vérifiée sur toutes les annonces, y compris celles d'autres prestataires) ----------
create or replace function public.listing_slug_taken(p_dest uuid, p_slug text, p_except uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.listings where destination_id = p_dest and slug = p_slug and id is distinct from p_except)
$$;
grant execute on function public.listing_slug_taken(uuid, text, uuid) to authenticated;

-- ---------- Droits d'exécution ----------
revoke all on function public.admin_users() from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
revoke all on function public.admin_set_provider_status(uuid, public.provider_status) from public, anon;
revoke all on function public.admin_moderate_listing(uuid, public.listing_status, text) from public, anon;
revoke all on function public.submit_listing(uuid) from public, anon;
revoke all on function public.admin_set_user(uuid, public.user_role, boolean) from public, anon;
revoke all on function public.admin_mark_payout_paid(uuid, text) from public, anon;
grant execute on function public.admin_set_user(uuid, public.user_role, boolean) to authenticated;
grant execute on function public.admin_mark_payout_paid(uuid, text) to authenticated;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_set_provider_status(uuid, public.provider_status) to authenticated;
grant execute on function public.admin_moderate_listing(uuid, public.listing_status, text) to authenticated;
grant execute on function public.submit_listing(uuid) to authenticated;
grant execute on function public.media_path_editable(text) to authenticated;
grant execute on function public.logo_path_editable(text) to authenticated;
-- flux iCal exporté vers Airbnb / Booking : protégé par son jeton secret, lisible sans compte
grant execute on function public.ical_feed(text) to anon, authenticated;
