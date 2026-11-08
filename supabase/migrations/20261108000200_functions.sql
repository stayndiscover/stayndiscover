-- =====================================================================
-- StaynDiscover — Migration 2/4 : logique métier en base
--   * rôles et inscription
--   * disponibilités, devis, commissions
--   * paiement en deux temps : tenue des dates/places -> autorisation -> capture
--   * annulations / remboursements
--   * synchronisation iCal (import) et flux iCal (export)
-- Les fonctions « service » ne sont exécutables que par la clé service_role
-- (Edge Functions). Les fonctions « client » utilisent auth.uid().
-- =====================================================================

-- ---------------------------------------------------------------------
-- Aides : rôle courant
-- ---------------------------------------------------------------------
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid() and is_active), false)
$$;

create or replace function public.my_provider_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.providers where owner_id = auth.uid()
$$;

create or replace function public.setting(p_key text, p_default jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.settings where key = p_key), p_default)
$$;

create or replace function public.notify(p_user uuid, p_kind text, p_payload jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, payload) values (p_user, p_kind, coalesce(p_payload, '{}'))
$$;

create or replace function public.notify_admins(p_kind text, p_payload jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, payload)
  select id, p_kind, coalesce(p_payload, '{}') from public.profiles where role = 'admin' and is_active
$$;

create or replace function public.audit(p_action text, p_entity text, p_id uuid, p_data jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, data) values (auth.uid(), p_action, p_entity, p_id, p_data)
$$;

-- ---------------------------------------------------------------------
-- Inscription : un profil par compte Supabase Auth.
-- Le rôle admin n'est JAMAIS accordé par les métadonnées d'inscription.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, preferred_lang)
  values (
    new.id,
    case when new.raw_user_meta_data->>'account_type' = 'provider' then 'provider'::public.user_role else 'client' end,
    new.raw_user_meta_data->>'full_name',
    coalesce(nullif(new.raw_user_meta_data->>'lang', ''), 'fr')
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un utilisateur ne peut pas changer lui-même son rôle ni se réactiver
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'FORBIDDEN: seul un administrateur peut modifier le rôle ou l''état d''un compte';
  end if;
  return new;
end $$;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Un prestataire ne peut ni s'auto-valider ni toucher à ses champs Stripe
create or replace function public.guard_provider_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'pending'; new.approved_at := null;
      new.stripe_account_id := null; new.stripe_charges_enabled := false; new.stripe_payouts_enabled := false;
    elsif new.status is distinct from old.status or new.approved_at is distinct from old.approved_at
       or new.stripe_account_id is distinct from old.stripe_account_id
       or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
       or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
       or new.payout_method is distinct from old.payout_method then
      raise exception 'FORBIDDEN: statut et paiements gérés par StaynDiscover';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_provider before insert or update on public.providers
  for each row execute function public.guard_provider_update();

-- Annonces : un prestataire ne publie jamais lui-même (validation admin obligatoire)
create or replace function public.guard_listing_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' and new.status not in ('draft','pending') then
      new.status := 'pending';
    elsif tg_op = 'UPDATE' then
      if new.status is distinct from old.status and new.status not in ('draft','pending','archived') then
        raise exception 'FORBIDDEN: la publication d''une annonce est validée par l''administration';
      end if;
      -- une annonce publiée modifiée sur le fond repasse en validation
      if old.status = 'published' and (new.title is distinct from old.title or new.description is distinct from old.description
          or new.category_id is distinct from old.category_id) then
        new.status := 'pending';
      end if;
      new.moderation_note := old.moderation_note;
      new.rating_avg := old.rating_avg; new.rating_count := old.rating_count;
    end if;
    if new.provider_id is null or new.provider_id not in (select public.my_provider_ids()) then
      raise exception 'FORBIDDEN: annonce d''un autre prestataire';
    end if;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  return new;
end $$;
create trigger trg_guard_listing before insert or update on public.listings
  for each row execute function public.guard_listing_status();

-- ---------------------------------------------------------------------
-- Commissions
-- ---------------------------------------------------------------------
create or replace function public.commission_rate_for(p_type public.listing_type, p_provider uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rate from public.commission_rates where type = p_type and provider_id = p_provider and valid_from <= now()
      order by valid_from desc limit 1),
    (select rate from public.commission_rates where type = p_type and provider_id is null and valid_from <= now()
      order by valid_from desc limit 1),
    0.12)
$$;

-- ---------------------------------------------------------------------
-- Disponibilités hébergement
-- ---------------------------------------------------------------------
-- Réservations actives = confirmées, ou tenues dont le délai n'a pas expiré
create or replace function public.unit_is_available(p_unit uuid, p_start date, p_end date, p_ignore_booking uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
           select 1 from public.unit_blocks b
            where b.unit_id = p_unit and b.period && daterange(p_start, p_end))
     and not exists (
           select 1 from public.bookings k
            where k.unit_id = p_unit and k.stay && daterange(p_start, p_end)
              and (k.status = 'confirmed' or (k.status = 'hold' and k.hold_expires_at > now()))
              and k.id is distinct from p_ignore_booking)
$$;

-- Nuits occupées, pour le calendrier public (sans dire pourquoi)
create or replace function public.get_unit_busy_nights(p_unit uuid, p_from date, p_to date)
returns table (night date) language sql stable security definer set search_path = public as $$
  select d::date from generate_series(p_from, p_to - 1, interval '1 day') d
   where not public.unit_is_available(p_unit, d::date, d::date + 1)
$$;

-- Prix d'un séjour : tarif saisonnier sinon tarif de base, + ménage
create or replace function public.quote_stay(p_unit uuid, p_start date, p_end date, p_guests int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  u public.accommodation_units; v_nights int := p_end - p_start; v_total numeric := 0; v_min int; d date; v_price numeric;
begin
  select * into u from public.accommodation_units where id = p_unit and is_active;
  if not found then raise exception 'UNAVAILABLE: logement introuvable'; end if;
  if v_nights < 1 then raise exception 'INVALID: dates incorrectes'; end if;
  if p_guests > u.max_guests then raise exception 'INVALID: % voyageurs maximum', u.max_guests; end if;
  select coalesce(max(r.min_nights), u.min_nights) into v_min from public.unit_rates r
   where r.unit_id = p_unit and r.period @> p_start;
  if v_nights < v_min then raise exception 'INVALID: séjour minimum % nuits', v_min; end if;
  d := p_start;
  while d < p_end loop
    select r.price_night into v_price from public.unit_rates r where r.unit_id = p_unit and r.period @> d;
    v_total := v_total + coalesce(v_price, u.base_price_night);
    d := d + 1;
  end loop;
  return jsonb_build_object('nights', v_nights, 'lodging', v_total, 'cleaning', u.cleaning_fee, 'total', v_total + u.cleaning_fee);
end $$;

-- ---------------------------------------------------------------------
-- Excursions : génération des créneaux à partir des règles récurrentes
-- ---------------------------------------------------------------------
create or replace function public.generate_slots(p_schedule uuid, p_until date default null) returns int
language plpgsql security definer set search_path = public as $$
declare s public.excursion_schedules; l public.listings; tz text; d date; n int := 0; v_start timestamptz;
begin
  select * into s from public.excursion_schedules where id = p_schedule;
  select * into l from public.listings where id = s.listing_id;
  if not (public.is_admin() or l.provider_id in (select public.my_provider_ids()) or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;
  select timezone into tz from public.destinations where id = l.destination_id;
  d := greatest(s.valid_from, current_date);
  while d <= least(s.valid_to, coalesce(p_until, s.valid_to)) loop
    if extract(dow from d)::int = any(s.weekdays) then
      v_start := (d + s.start_time) at time zone tz;
      insert into public.excursion_slots (listing_id, schedule_id, starts_at, ends_at, capacity, price_adult, price_child, meeting_point)
      values (l.id, s.id, v_start, v_start + make_interval(mins => s.duration_min), s.capacity, s.price_adult, s.price_child, s.meeting_point)
      on conflict (listing_id, starts_at) do nothing;
      if found then n := n + 1; end if;
    end if;
    d := d + 1;
  end loop;
  return n;
end $$;

-- Places restantes réelles (les tenues expirées sont libérées par release_expired_holds)
create or replace function public.slot_seats_left(p_slot uuid) returns int
language sql stable security definer set search_path = public as $$
  select capacity - seats_reserved from public.excursion_slots where id = p_slot
$$;

-- ---------------------------------------------------------------------
-- Libération des tenues expirées (pg_cron chaque minute + appel au début du paiement)
-- ---------------------------------------------------------------------
create or replace function public.release_expired_holds() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with expired as (
    update public.bookings set status = 'expired'
     where status = 'hold' and hold_expires_at <= now()
    returning slot_id, adults + children as seats, order_id
  ), freed as (
    update public.excursion_slots s set seats_reserved = s.seats_reserved - x.seats, updated_at = now()
      from (select slot_id, sum(seats) seats from expired where slot_id is not null group by slot_id) x
     where s.id = x.slot_id
    returning 1
  )
  update public.orders o set status = 'expired', failure_reason = 'délai de paiement dépassé'
   where o.status = 'awaiting_payment' and o.id in (select order_id from expired);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- PAIEMENT — étape 1 : le client lance le paiement de son panier.
-- Dans une seule transaction : revérifie tout, verrouille, tient les dates et
-- les places, calcule commissions et parts prestataires, crée la commande.
-- Si une seule ligne n'est plus disponible, rien n'est tenu (tout est annulé).
-- ---------------------------------------------------------------------
create or replace function public.start_checkout() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  c record; u public.accommodation_units; s public.excursion_slots; l public.listings; p public.providers;
  v_order uuid; v_hold timestamptz; v_amount numeric; v_rate numeric; v_comm numeric; v_quote jsonb;
  v_sub numeric := 0; v_comm_total numeric := 0; v_count int := 0;
begin
  if v_user is null then raise exception 'AUTH: connexion requise'; end if;
  perform public.release_expired_holds();
  v_hold := now() + make_interval(mins => (public.setting('hold_minutes', '35'))::text::int);

  insert into public.orders (user_id, hold_expires_at) values (v_user, v_hold) returning id into v_order;
  update public.orders set transfer_group = 'order_' || v_order where id = v_order;

  for c in select * from public.cart_items where user_id = v_user order by created_at loop
    v_count := v_count + 1;
    select * into l from public.listings where id = c.listing_id;
    if l.status <> 'published' then raise exception 'UNAVAILABLE:%: annonce hors ligne', c.id; end if;
    select * into p from public.providers where id = l.provider_id;
    if p.status <> 'approved' then raise exception 'UNAVAILABLE:%: prestataire non actif', c.id; end if;

    if c.unit_id is not null then
      -- verrou de ligne : deux paiements simultanés sur la même unité passent l'un après l'autre
      select * into u from public.accommodation_units where id = c.unit_id and listing_id = l.id for update;
      if not found then raise exception 'UNAVAILABLE:%: logement introuvable', c.id; end if;
      if not public.unit_is_available(u.id, c.start_date, c.end_date) then
        raise exception 'UNAVAILABLE:%: dates plus disponibles', c.id;
      end if;
      v_quote := public.quote_stay(u.id, c.start_date, c.end_date, c.adults + c.children);
      v_amount := (v_quote->>'total')::numeric;
    else
      select * into s from public.excursion_slots where id = c.slot_id and listing_id = l.id for update;
      if not found or s.status <> 'open' or s.starts_at <= now() then
        raise exception 'UNAVAILABLE:%: créneau fermé ou passé', c.id;
      end if;
      if s.capacity - s.seats_reserved < c.adults + c.children then
        raise exception 'UNAVAILABLE:%: plus que % places', c.id, s.capacity - s.seats_reserved;
      end if;
      update public.excursion_slots set seats_reserved = seats_reserved + c.adults + c.children, updated_at = now() where id = s.id;
      v_amount := s.price_adult * c.adults + coalesce(s.price_child, s.price_adult) * c.children;
      v_quote := jsonb_build_object('adults', c.adults, 'children', c.children, 'price_adult', s.price_adult, 'price_child', s.price_child);
    end if;

    v_rate := public.commission_rate_for(l.type, p.id);
    v_comm := round(v_amount * v_rate, 2);
    insert into public.bookings (order_id, user_id, provider_id, listing_id, type, unit_id, slot_id, stay, adults, children,
                                 amount, commission_rate, commission_amount, provider_amount, price_detail, hold_expires_at,
                                 external_push_status)
    values (v_order, v_user, p.id, l.id, l.type, c.unit_id, c.slot_id,
            case when c.unit_id is not null then daterange(c.start_date, c.end_date) end,
            c.adults, c.children, v_amount, v_rate, v_comm, v_amount - v_comm, v_quote, v_hold,
            case when exists (select 1 from public.calendar_connections cc
                               where cc.provider_id = p.id and cc.is_active and cc.kind <> 'ical'
                                 and (cc.listing_id = l.id or cc.unit_id = c.unit_id)) then 'pending' else 'not_needed' end);
    v_sub := v_sub + v_amount; v_comm_total := v_comm_total + v_comm;
  end loop;

  if v_count = 0 then raise exception 'INVALID: panier vide'; end if;
  update public.orders set subtotal = v_sub, total = v_sub, commission_total = v_comm_total where id = v_order;
  perform public.audit('checkout_started', 'order', v_order, jsonb_build_object('total', v_sub));
  return v_order;
exception
  when exclusion_violation then
    -- filet de sécurité : la contrainte no_double_booking a refusé un chevauchement
    raise exception 'UNAVAILABLE: ces dates viennent d''être réservées par un autre voyageur';
end $$;

-- étape 2 (service) : rattacher la session Stripe Checkout créée par l'Edge Function
create or replace function public.attach_checkout_session(p_order uuid, p_session text, p_payment_intent text) returns void
language sql security definer set search_path = public as $$
  update public.orders set stripe_checkout_session_id = p_session, stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id)
   where id = p_order
$$;

-- étape 3 (service, webhook checkout.session.completed — paiement AUTORISÉ, pas encore encaissé)
-- Renvoie 'capture' si tout est encore tenu, 'cancel' sinon : l'Edge Function capture
-- ou annule l'autorisation. Ainsi l'argent n'est jamais pris pour une réservation non garantie.
create or replace function public.authorize_order(p_order uuid, p_payment_intent text, p_event text) returns text
language plpgsql security definer set search_path = public as $$
declare o public.orders; v_bad int;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.payments (order_id, stripe_event_id, kind, amount, stripe_object_id)
  values (p_order, p_event, 'authorization', o.total, p_payment_intent) on conflict (stripe_event_id) do nothing;
  if o.status = 'authorized' then return 'capture'; end if;          -- webhook rejoué
  if o.status = 'paid' then return 'already_paid'; end if;
  if o.status <> 'awaiting_payment' then return 'cancel'; end if;

  select count(*) into v_bad from public.bookings
   where order_id = p_order and not (status = 'hold' and hold_expires_at > now());
  if v_bad > 0 then
    update public.orders set status = 'failed', failure_reason = 'disponibilité perdue avant paiement' where id = p_order;
    update public.bookings set status = 'failed' where order_id = p_order and status = 'hold';
    perform public.release_order_seats(p_order);
    perform public.notify(o.user_id, 'order_failed', jsonb_build_object('order', o.number));
    return 'cancel';
  end if;
  -- on prolonge la tenue le temps de la capture
  update public.bookings set hold_expires_at = now() + interval '15 minutes' where order_id = p_order;
  update public.orders set status = 'authorized', authorized_at = now(), stripe_payment_intent_id = p_payment_intent where id = p_order;
  return 'capture';
end $$;

create or replace function public.release_order_seats(p_order uuid) returns void
language sql security definer set search_path = public as $$
  update public.excursion_slots s set seats_reserved = s.seats_reserved - x.seats, updated_at = now()
    from (select slot_id, sum(adults + children) seats from public.bookings
           where order_id = p_order and slot_id is not null and status in ('failed') group by slot_id) x
   where s.id = x.slot_id
$$;

-- étape 4 (service, après capture réussie) : confirmation, reversements planifiés, notifications
create or replace function public.mark_order_paid(p_order uuid, p_charge text, p_event text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders; b record; v_method public.payout_method; v_start date;
begin
  select * into o from public.orders where id = p_order for update;
  if o.status = 'paid' then return; end if;                           -- idempotent
  if o.status <> 'authorized' then raise exception 'STATE: commande %', o.status; end if;
  insert into public.payments (order_id, stripe_event_id, kind, amount, stripe_object_id)
  values (p_order, p_event, 'capture', o.total, p_charge) on conflict (stripe_event_id) do nothing;
  update public.orders set status = 'paid', paid_at = now(), stripe_charge_id = p_charge where id = p_order;
  update public.bookings set status = 'confirmed', confirmed_at = now(), hold_expires_at = null where order_id = p_order;

  for b in select k.*, p.owner_id, p.payout_method pm from public.bookings k join public.providers p on p.id = k.provider_id
            where k.order_id = p_order loop
    v_start := coalesce(lower(b.stay), (select (starts_at)::date from public.excursion_slots where id = b.slot_id));
    -- reversement 1 jour après le début de la prestation (protège en cas d'annulation tardive)
    insert into public.payouts (booking_id, provider_id, amount, method, scheduled_for)
    values (b.id, b.provider_id, b.provider_amount, b.pm, v_start + 1);
    perform public.notify(b.owner_id, 'new_booking', jsonb_build_object('booking', b.id, 'order', o.number));
  end loop;

  insert into public.invoices (order_id, number) values (p_order, 'F' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0'));
  delete from public.cart_items where user_id = o.user_id;
  perform public.notify(o.user_id, 'booking_confirmed', jsonb_build_object('order', o.number));
  perform public.audit('order_paid', 'order', p_order, jsonb_build_object('total', o.total, 'charge', p_charge));
end $$;

-- échec de capture ou paiement abandonné (service)
create or replace function public.fail_order(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set status = 'failed' where order_id = p_order and status = 'hold';
  perform public.release_order_seats(p_order);
  update public.orders set status = 'failed', failure_reason = p_reason, cancelled_at = now()
   where id = p_order and status in ('awaiting_payment','authorized');
end $$;

-- ---------------------------------------------------------------------
-- Annulation et remboursement d'une réservation
-- Client : selon la politique d'annulation. Admin / prestataire : montant libre (≤ payé).
-- Crée une ligne « refunds » en attente : l'Edge Function exécute le remboursement Stripe.
-- ---------------------------------------------------------------------
create or replace function public.cancel_booking(p_booking uuid, p_reason text, p_refund numeric default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare b public.bookings; l public.listings; v_start timestamptz; v_hours numeric; v_refund numeric; v_is_staff boolean;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.status <> 'confirmed' then raise exception 'STATE: réservation non annulable'; end if;
  v_is_staff := public.is_admin() or b.provider_id in (select public.my_provider_ids()) or auth.uid() is null;
  if not v_is_staff and b.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  select * into l from public.listings where id = b.listing_id;
  v_start := coalesce((select starts_at from public.excursion_slots where id = b.slot_id),
                      (lower(b.stay) + (select check_in_time from public.accommodation_units where id = b.unit_id))::timestamptz);
  v_hours := extract(epoch from (v_start - now())) / 3600;
  if v_is_staff and p_refund is not null then
    v_refund := least(p_refund, b.amount - b.refunded_amount);
  elsif v_hours >= coalesce((l.cancellation_policy->>'free_until_hours')::numeric, 48) then
    v_refund := b.amount - b.refunded_amount;
  else
    v_refund := round(b.amount * coalesce((l.cancellation_policy->>'refund_pct_after')::numeric, 0) / 100, 2);
  end if;

  update public.bookings set status = case when v_refund > 0 then 'refunded' else 'cancelled' end::public.booking_status,
         cancelled_at = now(), cancel_reason = p_reason, refunded_amount = refunded_amount + v_refund,
         external_push_status = case when external_push_status = 'done' then 'pending' else external_push_status end
   where id = p_booking;
  if b.slot_id is not null then
    update public.excursion_slots set seats_reserved = seats_reserved - (b.adults + b.children), updated_at = now() where id = b.slot_id;
  end if;
  -- la part prestataire suit le remboursement au prorata
  update public.payouts set amount = round(b.provider_amount * (1 - v_refund / nullif(b.amount, 0)), 2),
         status = case when status = 'paid' then 'reversed' else status end
   where booking_id = p_booking;
  if v_refund > 0 then
    insert into public.refunds (order_id, booking_id, amount, reason, created_by) values (b.order_id, b.id, v_refund, p_reason, auth.uid());
  end if;
  update public.orders o set status = case when (select bool_and(status in ('cancelled','refunded')) from public.bookings where order_id = o.id)
                                           then 'refunded' else 'partially_refunded' end::public.order_status
   where o.id = b.order_id;
  perform public.notify(b.user_id, 'booking_cancelled', jsonb_build_object('booking', b.id, 'refund', v_refund));
  perform public.notify((select owner_id from public.providers where id = b.provider_id), 'booking_cancelled', jsonb_build_object('booking', b.id));
  perform public.audit('booking_cancelled', 'booking', b.id, jsonb_build_object('refund', v_refund, 'reason', p_reason));
  return v_refund;
end $$;

-- ---------------------------------------------------------------------
-- SYNCHRONISATION iCal — import (service, appelée par l'Edge Function « sync-calendars »)
-- p_events = [{"uid":"...","start":"2027-02-03","end":"2027-02-06"}, ...]
-- Remplace les blocages de cette connexion par l'état actuel du calendrier externe,
-- et signale tout conflit avec une réservation StaynDiscover.
-- ---------------------------------------------------------------------
create or replace function public.apply_ical_sync(p_connection uuid, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cc public.calendar_connections; v_run uuid; v_added int; v_removed int; v_conflicts jsonb; v_owner uuid;
begin
  select * into cc from public.calendar_connections where id = p_connection for update;
  insert into public.sync_runs (connection_id) values (p_connection) returning id into v_run;

  with ev as (
    select e->>'uid' uid, daterange((e->>'start')::date, (e->>'end')::date) period
      from jsonb_array_elements(p_events) e
     where (e->>'end')::date > (e->>'start')::date and (e->>'end')::date >= current_date
  ), del as (
    delete from public.unit_blocks b where b.connection_id = p_connection
       and not exists (select 1 from ev where ev.uid = b.external_uid and ev.period = b.period)
    returning 1
  )
  select count(*) into v_removed from del;

  with ev as (
    select e->>'uid' uid, daterange((e->>'start')::date, (e->>'end')::date) period
      from jsonb_array_elements(p_events) e
     where (e->>'end')::date > (e->>'start')::date and (e->>'end')::date >= current_date
  ), ins as (
    insert into public.unit_blocks (unit_id, period, source, connection_id, external_uid, note)
    select cc.unit_id, ev.period, 'ical', p_connection, ev.uid, cc.label from ev
    on conflict (connection_id, external_uid) do update set period = excluded.period
    returning 1
  )
  select count(*) into v_added from ins;

  -- conflit = un blocage externe chevauche une réservation StaynDiscover active
  select coalesce(jsonb_agg(jsonb_build_object('booking', k.id, 'stay', k.stay::text, 'external', b.period::text)), '[]')
    into v_conflicts
    from public.unit_blocks b join public.bookings k on k.unit_id = b.unit_id and k.stay && b.period
   where b.connection_id = p_connection and k.status in ('confirmed','hold');

  update public.sync_runs set finished_at = now(), events_seen = jsonb_array_length(p_events), blocks_added = v_added,
         blocks_removed = v_removed, conflicts = v_conflicts,
         status = case when jsonb_array_length(v_conflicts) > 0 then 'conflict' else 'ok' end
   where id = v_run;
  update public.calendar_connections set last_sync_at = now(), last_success_at = now(), consecutive_errors = 0, last_error = null,
         last_status = case when jsonb_array_length(v_conflicts) > 0 then 'conflict' else 'ok' end
   where id = p_connection;

  if jsonb_array_length(v_conflicts) > 0 then
    select owner_id into v_owner from public.providers where id = cc.provider_id;
    perform public.notify(v_owner, 'calendar_conflict', jsonb_build_object('connection', cc.label, 'conflicts', v_conflicts));
    perform public.notify_admins('calendar_conflict', jsonb_build_object('connection', p_connection, 'conflicts', v_conflicts));
  end if;
  return jsonb_build_object('added', v_added, 'removed', v_removed, 'conflicts', v_conflicts);
end $$;

create or replace function public.record_sync_error(p_connection uuid, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare cc public.calendar_connections;
begin
  update public.calendar_connections set last_sync_at = now(), last_status = 'error', last_error = left(p_error, 500),
         consecutive_errors = consecutive_errors + 1
   where id = p_connection returning * into cc;
  insert into public.sync_runs (connection_id, finished_at, status, error) values (p_connection, now(), 'error', left(p_error, 500));
  -- alerte au 3e échec d'affilée (≈ 45 min sans synchro avec l'intervalle par défaut)
  if cc.consecutive_errors = 3 then
    perform public.notify((select owner_id from public.providers where id = cc.provider_id), 'sync_error',
                          jsonb_build_object('connection', cc.label, 'error', cc.last_error));
    perform public.notify_admins('sync_error', jsonb_build_object('connection', p_connection, 'error', cc.last_error));
  end if;
end $$;

-- Connexions à synchroniser maintenant (lues par l'Edge Function planifiée)
create or replace function public.connections_due() returns setof public.calendar_connections
language sql stable security definer set search_path = public as $$
  select * from public.calendar_connections
   where is_active and direction in ('import','both')
     and (last_sync_at is null or last_sync_at < now() - make_interval(mins => sync_interval_minutes))
$$;

-- ---------------------------------------------------------------------
-- EXPORT iCal : flux StaynDiscover à coller dans Airbnb / Booking / Amenitiz
-- Contient les réservations StaynDiscover et les fermetures manuelles.
-- (Les blocages importés ne sont pas réexportés, pour éviter les boucles.)
-- ---------------------------------------------------------------------
create or replace function public.ical_feed(p_token text) returns text
language plpgsql stable security definer set search_path = public as $$
declare u public.accommodation_units; v text; r record;
begin
  select * into u from public.accommodation_units where ical_export_token = p_token and is_active;
  if not found then return null; end if;
  v := 'BEGIN:VCALENDAR' || chr(13) || chr(10) || 'VERSION:2.0' || chr(13) || chr(10) ||
       'PRODID:-//StaynDiscover//Calendar//FR' || chr(13) || chr(10) || 'CALSCALE:GREGORIAN' || chr(13) || chr(10);
  for r in
    select 'sd-booking-' || id uid, lower(stay) s, upper(stay) e, 'StaynDiscover' summary from public.bookings
     where unit_id = u.id and status in ('confirmed','hold') and upper(stay) >= current_date
    union all
    select 'sd-block-' || id, lower(period), upper(period), 'Indisponible' from public.unit_blocks
     where unit_id = u.id and source = 'manual' and upper(period) >= current_date
  loop
    v := v || 'BEGIN:VEVENT' || chr(13) || chr(10) ||
         'UID:' || r.uid || '@stayndiscover.com' || chr(13) || chr(10) ||
         'DTSTAMP:' || to_char(now() at time zone 'utc', 'YYYYMMDD"T"HH24MISS"Z"') || chr(13) || chr(10) ||
         'DTSTART;VALUE=DATE:' || to_char(r.s, 'YYYYMMDD') || chr(13) || chr(10) ||
         'DTEND;VALUE=DATE:' || to_char(r.e, 'YYYYMMDD') || chr(13) || chr(10) ||
         'SUMMARY:' || r.summary || chr(13) || chr(10) || 'END:VEVENT' || chr(13) || chr(10);
  end loop;
  return v || 'END:VCALENDAR' || chr(13) || chr(10);
end $$;

-- ---------------------------------------------------------------------
-- Avis : uniquement après une prestation terminée et payée
-- ---------------------------------------------------------------------
create or replace function public.guard_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare b public.bookings; v_end date;
begin
  if tg_op = 'INSERT' then
    select * into b from public.bookings where id = new.booking_id;
    v_end := coalesce(upper(b.stay), (select ends_at::date from public.excursion_slots where id = b.slot_id));
    if b.user_id <> auth.uid() or b.status <> 'confirmed' or v_end > current_date then
      raise exception 'FORBIDDEN: avis possible après une prestation terminée';
    end if;
    new.user_id := auth.uid(); new.listing_id := b.listing_id; new.provider_reply := null; new.replied_at := null;
  elsif tg_op = 'UPDATE' and auth.uid() is not null and not public.is_admin() then
    if (select provider_id from public.listings where id = old.listing_id) in (select public.my_provider_ids()) then
      -- le prestataire ne peut que répondre
      new.rating := old.rating; new.body := old.body; new.is_visible := old.is_visible;
      if new.provider_reply is distinct from old.provider_reply then new.replied_at := now(); end if;
    elsif old.user_id = auth.uid() then
      new.provider_reply := old.provider_reply; new.replied_at := old.replied_at; new.is_visible := old.is_visible;
    else
      raise exception 'FORBIDDEN';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_review before insert or update on public.reviews
  for each row execute function public.guard_review();

create or replace function public.refresh_listing_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.listings l set rating_avg = x.a, rating_count = x.n
    from (select round(avg(rating)::numeric, 2) a, count(*) n from public.reviews
           where listing_id = coalesce(new.listing_id, old.listing_id) and is_visible) x
   where l.id = coalesce(new.listing_id, old.listing_id);
  return null;
end $$;
create trigger trg_review_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_listing_rating();

-- ---------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_i18n(jsonb), public.my_role(), public.is_admin(), public.my_provider_ids(),
  public.get_unit_busy_nights(uuid, date, date), public.quote_stay(uuid, date, date, int), public.slot_seats_left(uuid),
  public.commission_rate_for(public.listing_type, uuid)
  to anon, authenticated;
grant execute on function public.start_checkout(), public.cancel_booking(uuid, text, numeric),
  public.generate_slots(uuid, date)
  to authenticated;
-- service_role (Edge Functions) : tout
grant execute on all functions in schema public to service_role;
