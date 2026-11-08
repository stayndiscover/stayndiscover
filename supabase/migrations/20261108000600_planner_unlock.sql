-- =====================================================================
-- StayNdiscover — Migration 6 : planificateur en essai gratuit, puis déblocage payant par séjour
-- Essai : chaque séjour accepte quelques activités gratuitement (réglage planner_free_items).
-- Au-delà, il faut débloquer le planificateur pour ce séjour (réglage planner_price, 19,99 €).
-- La sélection déjà faite est toujours conservée. La règle est appliquée par la base elle-même :
-- impossible de la contourner depuis le site.
-- =====================================================================
insert into public.settings (key, value) values
  ('planner_price', '19.99'),          -- prix du déblocage, en euros, par séjour
  ('planner_free_items', '3')          -- activités gratuites par séjour avant la fenêtre de déblocage
on conflict (key) do nothing;

create table public.planner_unlocks (
  id                         uuid primary key default gen_random_uuid(),
  trip_id                    uuid not null references public.trips(id) on delete cascade,
  user_id                    uuid not null references public.profiles(id) on delete cascade,
  amount                     numeric(10,2) not null check (amount >= 0),
  currency                   char(3) not null default 'EUR',
  status                     text not null default 'pending' check (status in ('pending','paid','refunded','cancelled')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now()
);
create unique index planner_unlocks_one_paid on public.planner_unlocks (trip_id) where status = 'paid';
create index planner_unlocks_user on public.planner_unlocks (user_id);

alter table public.planner_unlocks enable row level security;
create policy unlocks_read on public.planner_unlocks for select using (user_id = auth.uid() or public.is_admin());
-- Personne n'écrit directement dans cette table : tout passe par request_planner_unlock et mark_planner_unlock_paid.
revoke all on public.planner_unlocks from anon, authenticated;
grant select on public.planner_unlocks to authenticated;
grant all on public.planner_unlocks to service_role;

create or replace function public.setting_num(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from public.settings where key = p_key), p_default)
$$;

create or replace function public.trip_is_unlocked(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.planner_unlocks where trip_id = p_trip and status = 'paid')
$$;

/** État du planificateur pour un séjour : débloqué ?, activités utilisées / gratuites, prix. */
create or replace function public.planner_status(p_trip uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_owner uuid;
begin
  select user_id into v_owner from public.trips where id = p_trip;
  if v_owner is null or (v_owner <> auth.uid() and not public.is_admin() and auth.role() <> 'service_role') then
    raise exception 'FORBIDDEN: séjour inconnu';
  end if;
  return jsonb_build_object(
    'unlocked',   public.trip_is_unlocked(p_trip),
    'used',       (select count(*) from public.trip_items where trip_id = p_trip),
    'free_items', public.setting_num('planner_free_items', 3)::int,
    'price',      public.setting_num('planner_price', 19.99),
    'currency',   'EUR');
end $$;

-- Filet de sécurité : au-delà de l'essai gratuit, on ne peut plus ajouter d'activité tant que le séjour n'est pas débloqué.
-- La création du séjour (favoris ajoutés d'office) et l'admin ne sont pas bloqués : la sélection est toujours gardée.
create or replace function public.guard_trip_item_paywall() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or auth.uid() is null or current_setting('stayndiscover.trip_creation', true) = 'on' then
    return new;
  end if;
  if not public.trip_is_unlocked(new.trip_id)
     and (select count(*) from public.trip_items where trip_id = new.trip_id) >= public.setting_num('planner_free_items', 3) then
    raise exception 'PAYWALL: planificateur à débloquer pour ce séjour';
  end if;
  return new;
end $$;
create trigger trip_items_paywall before insert on public.trip_items
  for each row execute function public.guard_trip_item_paywall();

/** Le voyageur demande le déblocage : crée (ou réutilise) une demande en attente, au prix fixé par l'admin. */
create or replace function public.request_planner_unlock(p_trip uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.trips where id = p_trip and user_id = auth.uid()) then
    raise exception 'FORBIDDEN: séjour inconnu';
  end if;
  if public.trip_is_unlocked(p_trip) then
    select id into v_id from public.planner_unlocks where trip_id = p_trip and status = 'paid';
    return v_id;
  end if;
  select id into v_id from public.planner_unlocks where trip_id = p_trip and status = 'pending' order by created_at desc limit 1;
  if v_id is null then
    insert into public.planner_unlocks (trip_id, user_id, amount)
    values (p_trip, auth.uid(), public.setting_num('planner_price', 19.99)) returning id into v_id;
  else
    update public.planner_unlocks set amount = public.setting_num('planner_price', 19.99) where id = v_id;
  end if;
  return v_id;
end $$;

/** Appelée par le webhook Stripe (rôle service) : le paiement est confirmé. Rejouable sans doublon. */
create or replace function public.mark_planner_unlock_paid(p_unlock uuid, p_session text default null, p_payment_intent text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v public.planner_unlocks;
begin
  -- Seul le serveur (rôle service, webhook Stripe) peut l'appeler : voir les droits en bas du fichier.
  select * into v from public.planner_unlocks where id = p_unlock for update;
  if v.id is null then raise exception 'INVALID: déblocage inconnu'; end if;
  if v.status = 'paid' then return true; end if;
  if public.trip_is_unlocked(v.trip_id) then
    update public.planner_unlocks set status = 'cancelled' where id = v.id;  -- déjà payé par ailleurs
    return true;
  end if;
  update public.planner_unlocks set status = 'paid', paid_at = now(),
    stripe_checkout_session_id = coalesce(p_session, stripe_checkout_session_id),
    stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id)
   where id = v.id;
  insert into public.notifications (user_id, kind, payload)
  values (v.user_id, 'planner_unlocked', jsonb_build_object('trip_id', v.trip_id, 'amount', v.amount));
  return true;
end $$;

revoke execute on function public.mark_planner_unlock_paid(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_planner_unlock_paid(uuid, text, text) to service_role;
revoke execute on function public.request_planner_unlock(uuid) from public, anon;
grant execute on function public.request_planner_unlock(uuid), public.planner_status(uuid), public.trip_is_unlocked(uuid) to authenticated;
