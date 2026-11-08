-- =====================================================================
-- StayNdiscover : INSTALLATION COMPLÈTE DE LA BASE (les 6 migrations, dans l'ordre)
-- À coller en une seule fois dans Supabase > SQL Editor, puis cliquer sur Run.
-- Tout s'installe ou rien ne s'installe (en cas d'erreur, rien n'est modifié).
-- =====================================================================
begin;

-- >>>>> 20261108000100_schema.sql
-- =====================================================================
-- StayNdiscover — schéma principal (Supabase / PostgreSQL 15+)
-- Migration 1/4 : extensions, types, tables, index, contraintes
-- =====================================================================
-- Conventions
--   * Textes traduits : jsonb {"fr": "...", "en": "...", "es": "..."} (fr obligatoire)
--   * Montants : numeric(12,2) en devise de la commande (EUR par défaut)
--   * Dates de séjour : daterange [arrivée, départ) — la nuit du départ n'est pas comptée
--   * Horaires d'excursion : timestamptz (fuseau de la destination)
-- =====================================================================

create schema if not exists extensions;     -- existe déjà sur Supabase
create extension if not exists btree_gist with schema extensions;   -- contraintes d'exclusion anti-chevauchement

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.user_role        as enum ('client', 'provider', 'admin');
create type public.listing_type     as enum ('hebergement', 'excursion', 'lieu');
create type public.listing_status   as enum ('draft', 'pending', 'changes_requested', 'published', 'refused', 'archived');
create type public.provider_status  as enum ('pending', 'approved', 'suspended');
create type public.payout_method    as enum ('stripe_connect', 'manual_transfer');
create type public.order_status     as enum ('awaiting_payment', 'authorized', 'paid', 'partially_refunded', 'refunded', 'cancelled', 'failed', 'expired');
create type public.booking_status   as enum ('hold', 'confirmed', 'cancelled', 'refunded', 'expired', 'failed');
create type public.payout_status    as enum ('pending', 'scheduled', 'paid', 'failed', 'reversed');
create type public.integration_kind as enum ('ical', 'amenitiz', 'fareharbor', 'channel_manager', 'other_api');
create type public.sync_direction   as enum ('import', 'export', 'both');
create type public.block_source     as enum ('manual', 'ical', 'api');
create type public.slot_status      as enum ('open', 'closed', 'cancelled');
create type public.trip_pace        as enum ('calm', 'balanced', 'intense');

-- Vérifie qu'un champ traduit contient au moins le français
create or replace function public.is_i18n(j jsonb) returns boolean
language sql immutable as $$
  select j is not null and jsonb_typeof(j) = 'object' and coalesce(j->>'fr', '') <> ''
$$;

-- ---------------------------------------------------------------------
-- Comptes
-- ---------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  role            public.user_role not null default 'client',
  full_name       text,
  phone           text,
  avatar_path     text,
  preferred_lang  text not null default 'fr' check (preferred_lang in ('fr','en','es')),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.destinations (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name          jsonb not null check (public.is_i18n(name)),
  description   jsonb not null default '{"fr":""}',
  country_code  char(2) not null,
  timezone      text not null,                -- ex. America/Martinique
  currency      char(3) not null default 'EUR',
  lat           double precision not null,
  lng           double precision not null,
  cover_path    text,
  theme         jsonb not null default '{}',  -- identité visuelle propre à la destination
  is_active     boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create table public.providers (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null references public.profiles(id) on delete restrict,
  trade_name              text not null,
  logo_path               text,
  email                   text,
  phone                   text,
  address                 text,
  country_code            char(2) not null,
  destination_id          uuid references public.destinations(id),
  description             jsonb not null default '{"fr":""}',
  legal_info              jsonb not null default '{}',     -- SIRET, ICE (Maroc), numéro fiscal…
  status                  public.provider_status not null default 'pending',
  payout_method           public.payout_method not null default 'stripe_connect',
  stripe_account_id       text unique,
  stripe_charges_enabled  boolean not null default false,
  stripe_payouts_enabled  boolean not null default false,
  manual_payout_details   jsonb,                           -- IBAN/RIB chiffré côté app, jamais exposé publiquement
  approved_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index on public.providers (owner_id);

-- ---------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------
-- Deux catégories principales (hebergement, excursion) + sous-catégories.
-- Les « lieux » (restaurants, plages…) n'ont pas de catégorie principale propre :
-- ce sont des sous-catégories de type 'lieu'. Pas de catégorie « Experience ».
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  type        public.listing_type not null,
  parent_id   uuid references public.categories(id),
  name        jsonb not null check (public.is_i18n(name)),
  icon        text,
  sort_order  int not null default 0
);

create table public.listings (
  id                  uuid primary key default gen_random_uuid(),
  provider_id         uuid references public.providers(id) on delete restrict,  -- null = fiche éditoriale (plage, point de vue…)
  destination_id      uuid not null references public.destinations(id),
  category_id         uuid not null references public.categories(id),
  type                public.listing_type not null,
  slug                text not null,
  status              public.listing_status not null default 'draft',
  title               jsonb not null check (public.is_i18n(title)),
  summary             jsonb not null default '{"fr":""}',
  description         jsonb not null default '{"fr":""}',
  -- Localisation commune à toutes les fiches : au moins un des quatre champs
  address             text,
  lat                 double precision check (lat between -90 and 90),
  lng                 double precision check (lng between -180 and 180),
  google_maps_url     text,
  google_place_id     text,
  -- Infos pratiques
  opening_hours       jsonb,          -- {"mon":[["09:00","17:00"]], "tue":[], ...} ; null = toujours ouvert
  closed_dates        date[] not null default '{}',
  price_from          numeric(12,2),
  currency            char(3) not null default 'EUR',
  visit_minutes       int check (visit_minutes > 0),       -- durée recommandée (lieux)
  booking_required    boolean not null default false,
  accessibility       text,
  best_period         jsonb,
  tips                jsonb,
  highlights          jsonb,
  conditions          jsonb,          -- conditions de réservation
  cancellation_policy jsonb not null default '{"free_until_hours": 48, "refund_pct_after": 0}',
  moderation_note     text,           -- message de l'admin (photos demandées, refus…)
  rating_avg          numeric(3,2),
  rating_count        int not null default 0,
  created_by          uuid references public.profiles(id),
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (destination_id, slug),
  constraint listing_has_location check (
    address is not null or (lat is not null and lng is not null) or google_maps_url is not null or google_place_id is not null
  ),
  constraint bookable_needs_provider check (type = 'lieu' or provider_id is not null)
);
create index on public.listings (destination_id, type, status);
create index on public.listings (provider_id);
create index on public.listings (category_id);

create table public.listing_media (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  kind         text not null check (kind in ('photo','video')),
  storage_path text not null,           -- bucket « listing-media »
  alt          jsonb,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index on public.listing_media (listing_id, sort_order);

-- ---------------------------------------------------------------------
-- Hébergements : une annonce = une ou plusieurs unités (villa entière, chambre n°3…)
-- Chaque unité a son propre calendrier : c'est l'unité qui ne peut pas être réservée deux fois.
-- ---------------------------------------------------------------------
create table public.accommodation_units (
  id                 uuid primary key default gen_random_uuid(),
  listing_id         uuid not null references public.listings(id) on delete cascade,
  name               jsonb not null check (public.is_i18n(name)),
  max_guests         int not null check (max_guests > 0),
  base_price_night   numeric(12,2) not null check (base_price_night >= 0),
  cleaning_fee       numeric(12,2) not null default 0,
  min_nights         int not null default 1 check (min_nights >= 1),
  check_in_time      time not null default '15:00',
  check_out_time     time not null default '11:00',
  ical_export_token  text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);
create index on public.accommodation_units (listing_id);

-- Tarifs saisonniers (une période ne chevauche pas une autre pour la même unité)
create table public.unit_rates (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references public.accommodation_units(id) on delete cascade,
  period        daterange not null,
  price_night   numeric(12,2) not null check (price_night >= 0),
  min_nights    int check (min_nights >= 1),
  exclude using gist (unit_id with =, period with &&)
);

-- Dates bloquées : fermeture manuelle, import iCal, ou API externe.
-- Plusieurs sources peuvent se recouvrir (Airbnb + fermeture manuelle) : pas d'exclusion ici.
create table public.unit_blocks (
  id             uuid primary key default gen_random_uuid(),
  unit_id        uuid not null references public.accommodation_units(id) on delete cascade,
  period         daterange not null check (not isempty(period)),
  source         public.block_source not null,
  connection_id  uuid,                 -- FK ajoutée plus bas (calendar_connections)
  external_uid   text,                 -- UID de l'événement iCal / id externe
  note           text,
  created_at     timestamptz not null default now(),
  unique (connection_id, external_uid)
);
create index unit_blocks_gist on public.unit_blocks using gist (unit_id, period);

-- ---------------------------------------------------------------------
-- Excursions : créneaux datés avec capacité
-- ---------------------------------------------------------------------
create table public.excursion_schedules (          -- règle récurrente saisie par le prestataire
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings(id) on delete cascade,
  weekdays        int[] not null check (weekdays <@ array[0,1,2,3,4,5,6]),  -- 0 = dimanche
  start_time      time not null,
  duration_min    int not null check (duration_min > 0),
  capacity        int not null check (capacity > 0),
  price_adult     numeric(12,2) not null check (price_adult >= 0),
  price_child     numeric(12,2) check (price_child >= 0),
  child_max_age   int default 11,
  meeting_point   text,
  meeting_lat     double precision,
  meeting_lng     double precision,
  valid_from      date not null,
  valid_to        date not null,
  check (valid_to >= valid_from)
);

create table public.excursion_slots (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings(id) on delete cascade,
  schedule_id     uuid references public.excursion_schedules(id) on delete set null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  capacity        int not null check (capacity > 0),
  seats_reserved  int not null default 0,       -- places tenues (paiement en cours) + confirmées
  price_adult     numeric(12,2) not null check (price_adult >= 0),
  price_child     numeric(12,2) check (price_child >= 0),
  meeting_point   text,
  status          public.slot_status not null default 'open',
  source          public.block_source not null default 'manual',
  external_id     text,                          -- id du créneau FareHarbor
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  check (seats_reserved >= 0 and seats_reserved <= capacity),   -- jamais de surréservation
  unique (listing_id, starts_at)
);
create index on public.excursion_slots (listing_id, starts_at);

-- ---------------------------------------------------------------------
-- Voyageur : favoris, séjours, planificateur
-- ---------------------------------------------------------------------
create table public.favorites (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  listing_id  uuid not null references public.listings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.trips (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  destination_id        uuid not null references public.destinations(id),
  title                 text,
  start_date            date not null,
  end_date              date not null,
  arrival_time          time,
  departure_time        time,
  adults                int not null default 2 check (adults >= 1),
  children              int not null default 0 check (children >= 0),
  accommodation_id      uuid references public.listings(id),
  activity_start        time not null default '09:00',
  activity_end          time not null default '19:00',
  pace                  public.trip_pace not null default 'balanced',
  budget                numeric(12,2),
  preferences           text,
  plan_generated_at     timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (end_date >= start_date),
  check (activity_end > activity_start)
);
create index on public.trips (user_id);

-- Un élément du programme. day/start_time remplis par le planificateur ;
-- locked = l'utilisateur l'a placé à la main (le recalcul ne le déplace pas).
create table public.trip_items (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  listing_id    uuid not null references public.listings(id) on delete cascade,
  slot_id       uuid references public.excursion_slots(id),
  day           date,
  start_time    time,
  duration_min  int,
  travel_min    int,              -- trajet depuis l'étape précédente (Google Routes)
  locked        boolean not null default false,
  sort_order    int not null default 0,
  warnings      text[] not null default '{}',
  notes         text,
  created_at    timestamptz not null default now(),
  unique (trip_id, listing_id)
);

-- ---------------------------------------------------------------------
-- Panier, commandes, réservations
-- ---------------------------------------------------------------------
create table public.cart_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  listing_id   uuid not null references public.listings(id) on delete cascade,
  unit_id      uuid references public.accommodation_units(id),
  slot_id      uuid references public.excursion_slots(id),
  start_date   date,
  end_date     date,
  adults       int not null default 1 check (adults >= 0),
  children     int not null default 0 check (children >= 0),
  trip_id      uuid references public.trips(id) on delete set null,
  created_at   timestamptz not null default now(),
  check ((unit_id is not null and start_date is not null and end_date > start_date and slot_id is null)
      or (slot_id is not null and unit_id is null)),
  check (adults + children >= 1)
);
create index on public.cart_items (user_id);

create sequence public.order_number_seq start 1000;

create table public.orders (
  id                          uuid primary key default gen_random_uuid(),
  number                      text not null unique default ('SD-' || nextval('public.order_number_seq')),
  user_id                     uuid not null references public.profiles(id),
  status                      public.order_status not null default 'awaiting_payment',
  currency                    char(3) not null default 'EUR',
  subtotal                    numeric(12,2) not null default 0,
  fees                        numeric(12,2) not null default 0,     -- frais de service client éventuels
  total                       numeric(12,2) not null default 0,
  commission_total            numeric(12,2) not null default 0,
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text unique,
  stripe_charge_id            text,
  transfer_group              text unique,
  hold_expires_at             timestamptz not null,
  authorized_at               timestamptz,
  paid_at                     timestamptz,
  cancelled_at                timestamptz,
  failure_reason              text,
  created_at                  timestamptz not null default now()
);
create index on public.orders (user_id, created_at desc);

-- Commission par type (modifiable par l'admin), surcharge possible par prestataire
create table public.commission_rates (
  id           uuid primary key default gen_random_uuid(),
  type         public.listing_type not null,
  provider_id  uuid references public.providers(id),
  rate         numeric(5,4) not null check (rate >= 0 and rate < 1),   -- 0.1200 = 12 %
  valid_from   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

-- Une réservation = une ligne de commande pour un prestataire
create table public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  user_id             uuid not null references public.profiles(id),
  provider_id         uuid not null references public.providers(id),
  listing_id          uuid not null references public.listings(id),
  type                public.listing_type not null check (type in ('hebergement','excursion')),
  unit_id             uuid references public.accommodation_units(id),
  slot_id             uuid references public.excursion_slots(id),
  stay                daterange,                    -- hébergement
  adults              int not null default 1,
  children            int not null default 0,
  status              public.booking_status not null default 'hold',
  amount              numeric(12,2) not null check (amount >= 0),
  commission_rate     numeric(5,4) not null,
  commission_amount   numeric(12,2) not null,
  provider_amount     numeric(12,2) not null,
  refunded_amount     numeric(12,2) not null default 0,
  price_detail        jsonb not null default '{}',
  hold_expires_at     timestamptz,
  confirmed_at        timestamptz,
  cancelled_at        timestamptz,
  cancel_reason       text,
  external_ref        text,                         -- id chez le PMS / FareHarbor après transmission
  external_push_status text not null default 'not_needed' check (external_push_status in ('not_needed','pending','done','failed')),
  created_at          timestamptz not null default now(),
  check ((type = 'hebergement' and unit_id is not null and stay is not null and slot_id is null)
      or (type = 'excursion' and slot_id is not null and unit_id is null)),
  check (provider_amount + commission_amount = amount)
);
create index on public.bookings (order_id);
create index on public.bookings (provider_id, status);
create index on public.bookings (user_id);

-- LE verrou anti double réservation côté plateforme :
-- deux réservations actives (tenue ou confirmée) d'une même unité ne peuvent pas se chevaucher.
alter table public.bookings add constraint no_double_booking
  exclude using gist (unit_id with =, stay with &&)
  where (type = 'hebergement' and status in ('hold','confirmed'));

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id),
  stripe_event_id    text unique,                  -- idempotence des webhooks
  kind               text not null check (kind in ('authorization','capture','cancel','refund','failure')),
  amount             numeric(12,2) not null,
  stripe_object_id   text,
  raw                jsonb,
  created_at         timestamptz not null default now()
);

create table public.refunds (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id),
  booking_id        uuid references public.bookings(id),
  amount            numeric(12,2) not null check (amount > 0),
  reason            text,
  stripe_refund_id  text unique,
  status            text not null default 'pending' check (status in ('pending','succeeded','failed')),
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);

create table public.payouts (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null unique references public.bookings(id),
  provider_id         uuid not null references public.providers(id),
  amount              numeric(12,2) not null,
  currency            char(3) not null default 'EUR',
  method              public.payout_method not null,
  status              public.payout_status not null default 'pending',
  scheduled_for       date,                        -- ex. 1 jour après l'arrivée / la sortie
  stripe_transfer_id  text unique,
  manual_reference    text,                        -- référence du virement manuel
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index on public.payouts (status, scheduled_for);

create sequence public.invoice_number_seq start 1;
create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id),
  number       text not null unique,
  kind         text not null default 'receipt' check (kind in ('receipt','credit_note','provider_statement')),
  storage_path text,                                -- PDF dans le bucket privé « documents »
  issued_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Calendriers externes et synchronisation
-- ---------------------------------------------------------------------
create table public.calendar_connections (
  id                    uuid primary key default gen_random_uuid(),
  provider_id           uuid not null references public.providers(id) on delete cascade,
  listing_id            uuid references public.listings(id) on delete cascade,
  unit_id               uuid references public.accommodation_units(id) on delete cascade,
  kind                  public.integration_kind not null,
  label                 text not null,                 -- « Airbnb », « Booking.com », « Amenitiz »…
  direction             public.sync_direction not null default 'import',
  ical_url              text,                          -- lien secret fourni par la plateforme
  external_account_id   text,
  vault_secret_id       uuid,                          -- clé API stockée dans Supabase Vault
  sync_interval_minutes int not null default 15 check (sync_interval_minutes >= 5),
  is_active             boolean not null default true,
  last_sync_at          timestamptz,
  last_success_at       timestamptz,
  last_status           text check (last_status in ('ok','error','conflict')),
  last_error            text,
  consecutive_errors    int not null default 0,
  created_at            timestamptz not null default now(),
  check (kind <> 'ical' or (ical_url is not null and unit_id is not null))
);
alter table public.unit_blocks
  add constraint unit_blocks_connection_fk foreign key (connection_id) references public.calendar_connections(id) on delete cascade;

create table public.sync_runs (
  id              uuid primary key default gen_random_uuid(),
  connection_id   uuid not null references public.calendar_connections(id) on delete cascade,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running' check (status in ('running','ok','error','conflict')),
  events_seen     int,
  blocks_added    int,
  blocks_removed  int,
  conflicts       jsonb,
  error           text
);
create index on public.sync_runs (connection_id, started_at desc);

-- ---------------------------------------------------------------------
-- Avis, notifications, contenus, réglages, journal
-- ---------------------------------------------------------------------
create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null unique references public.bookings(id),
  listing_id     uuid not null references public.listings(id),
  user_id        uuid not null references public.profiles(id),
  rating         int not null check (rating between 1 and 5),
  body           text not null,
  lang           text not null default 'fr',
  provider_reply text,
  replied_at     timestamptz,
  is_visible     boolean not null default true,
  created_at     timestamptz not null default now()
);
create index on public.reviews (listing_id) where is_visible;

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,       -- booking_confirmed, new_booking, sync_error, listing_review…
  payload     jsonb not null default '{}',
  read_at     timestamptz,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create table public.site_content (
  key          text primary key,          -- 'home.hero', 'page.cgv', 'page.mentions'…
  value        jsonb not null,            -- {"fr":{...},"en":{...},"es":{...}}
  is_published boolean not null default true,
  updated_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now()
);

create table public.settings (
  key    text primary key,
  value  jsonb not null
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  data        jsonb,
  created_at  timestamptz not null default now()
);
create index on public.audit_log (entity, entity_id);

-- updated_at automatique
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger trg_profiles_touch  before update on public.profiles  for each row execute function public.touch_updated_at();
create trigger trg_providers_touch before update on public.providers for each row execute function public.touch_updated_at();
create trigger trg_listings_touch  before update on public.listings  for each row execute function public.touch_updated_at();
create trigger trg_trips_touch     before update on public.trips     for each row execute function public.touch_updated_at();

-- >>>>> 20261108000200_functions.sql
-- =====================================================================
-- StayNdiscover — Migration 2/4 : logique métier en base
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
      raise exception 'FORBIDDEN: statut et paiements gérés par StayNdiscover';
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
-- et signale tout conflit avec une réservation StayNdiscover.
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

  -- conflit = un blocage externe chevauche une réservation StayNdiscover active
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
-- EXPORT iCal : flux StayNdiscover à coller dans Airbnb / Booking / Amenitiz
-- Contient les réservations StayNdiscover et les fermetures manuelles.
-- (Les blocages importés ne sont pas réexportés, pour éviter les boucles.)
-- ---------------------------------------------------------------------
create or replace function public.ical_feed(p_token text) returns text
language plpgsql stable security definer set search_path = public as $$
declare u public.accommodation_units; v text; r record;
begin
  select * into u from public.accommodation_units where ical_export_token = p_token and is_active;
  if not found then return null; end if;
  v := 'BEGIN:VCALENDAR' || chr(13) || chr(10) || 'VERSION:2.0' || chr(13) || chr(10) ||
       'PRODID:-//StayNdiscover//Calendar//FR' || chr(13) || chr(10) || 'CALSCALE:GREGORIAN' || chr(13) || chr(10);
  for r in
    select 'sd-booking-' || id uid, lower(stay) s, upper(stay) e, 'StayNdiscover' summary from public.bookings
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

-- >>>>> 20261108000300_rls.sql
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

-- >>>>> 20261108000400_seed.sql
-- =====================================================================
-- StayNdiscover — Migration 4/4 : données de départ et tâches planifiées
-- =====================================================================

-- ---------- Destinations initiales ----------
insert into public.destinations (slug, name, description, country_code, timezone, currency, lat, lng, is_active, sort_order, theme) values
('martinique', '{"fr":"Martinique","en":"Martinique","es":"Martinica"}',
 '{"fr":"Plages de sable blanc, mornes verdoyants, distilleries et fonds marins.","en":"White-sand beaches, green hills, distilleries and rich sea life.","es":"Playas de arena blanca, colinas verdes, destilerías y fondos marinos."}',
 'MQ', 'America/Martinique', 'EUR', 14.6415, -61.0242, true, 1, '{"accent":"#0b6e63"}'),
('belize', '{"fr":"Belize","en":"Belize","es":"Belice"}',
 '{"fr":"Barrière de corail, cayes paisibles, jungle et cités mayas.","en":"Barrier reef, laid-back cayes, jungle and Maya cities.","es":"Barrera de coral, cayos tranquilos, selva y ciudades mayas."}',
 'BZ', 'America/Belize', 'EUR', 17.2510, -88.7590, true, 2, '{"accent":"#17a5a0"}'),
('maroc', '{"fr":"Maroc","en":"Morocco","es":"Marruecos"}',
 '{"fr":"Médinas, riads, désert d''Agafay et vallées de l''Atlas.","en":"Medinas, riads, the Agafay desert and Atlas valleys.","es":"Medinas, riads, el desierto de Agafay y los valles del Atlas."}',
 'MA', 'Africa/Casablanca', 'EUR', 31.6295, -7.9811, true, 3, '{"accent":"#c8673f"}');

-- ---------- Catégories : 2 principales + sous-catégories ; lieux en sous-catégories ----------
insert into public.categories (slug, type, name, sort_order) values
('hebergement', 'hebergement', '{"fr":"Hébergement","en":"Accommodation","es":"Alojamiento"}', 1),
('excursion',   'excursion',   '{"fr":"Excursion","en":"Excursion","es":"Excursión"}', 2);

insert into public.categories (slug, type, parent_id, name, sort_order)
select v.slug, v.type::public.listing_type, (select id from public.categories where slug = v.parent), v.name::jsonb, v.ord
from (values
 ('villa','hebergement','hebergement','{"fr":"Villa","en":"Villa","es":"Villa"}',1),
 ('maison','hebergement','hebergement','{"fr":"Maison","en":"House","es":"Casa"}',2),
 ('appartement','hebergement','hebergement','{"fr":"Appartement","en":"Apartment","es":"Apartamento"}',3),
 ('studio','hebergement','hebergement','{"fr":"Studio","en":"Studio","es":"Estudio"}',4),
 ('riad','hebergement','hebergement','{"fr":"Riad","en":"Riad","es":"Riad"}',5),
 ('bungalow','hebergement','hebergement','{"fr":"Bungalow","en":"Bungalow","es":"Bungaló"}',6),
 ('chambre-hotes','hebergement','hebergement','{"fr":"Chambre d''hôtes","en":"Guesthouse","es":"Casa de huéspedes"}',7),
 ('hotel','hebergement','hebergement','{"fr":"Hôtel","en":"Hotel","es":"Hotel"}',8),
 ('location-saisonniere','hebergement','hebergement','{"fr":"Location saisonnière","en":"Holiday rental","es":"Alquiler vacacional"}',9),
 ('bateau','excursion','excursion','{"fr":"Excursion en bateau","en":"Boat trip","es":"Excursión en barco"}',1),
 ('nautique','excursion','excursion','{"fr":"Activité nautique","en":"Water activity","es":"Actividad náutica"}',2),
 ('plongee','excursion','excursion','{"fr":"Plongée","en":"Diving","es":"Buceo"}',3),
 ('dauphins','excursion','excursion','{"fr":"Observation des dauphins","en":"Dolphin watching","es":"Avistamiento de delfines"}',4),
 ('randonnee-guidee','excursion','excursion','{"fr":"Randonnée guidée","en":"Guided hike","es":"Senderismo guiado"}',5),
 ('visite-guidee','excursion','excursion','{"fr":"Visite guidée","en":"Guided tour","es":"Visita guiada"}',6),
 ('culture','excursion','excursion','{"fr":"Découverte culturelle","en":"Cultural discovery","es":"Descubrimiento cultural"}',7),
 ('sport','excursion','excursion','{"fr":"Activité sportive","en":"Sports activity","es":"Actividad deportiva"}',8),
 ('experience-locale','excursion','excursion','{"fr":"Expérience locale","en":"Local experience","es":"Experiencia local"}',9)
) v(slug, type, parent, name, ord);

insert into public.categories (slug, type, name, sort_order) values
('restaurant','lieu','{"fr":"Restaurant","en":"Restaurant","es":"Restaurante"}',1),
('plage','lieu','{"fr":"Plage","en":"Beach","es":"Playa"}',2),
('randonnee','lieu','{"fr":"Randonnée","en":"Hike","es":"Senderismo"}',3),
('site-attraction','lieu','{"fr":"Site et attraction","en":"Sight and attraction","es":"Sitio y atracción"}',4),
('marche','lieu','{"fr":"Marché","en":"Market","es":"Mercado"}',5),
('point-de-vue','lieu','{"fr":"Point de vue","en":"Viewpoint","es":"Mirador"}',6),
('spot-photo','lieu','{"fr":"Lieu insolite et spot photo","en":"Hidden gem and photo spot","es":"Rincón insólito y fotográfico"}',7);

-- ---------- Commissions de départ (modifiables par l'admin : nouvelle ligne = nouveau taux) ----------
insert into public.commission_rates (type, rate) values ('hebergement', 0.12), ('excursion', 0.12);

-- ---------- Réglages ----------
insert into public.settings (key, value) values
('hold_minutes', '35'),                         -- tenue des dates pendant le paiement (> 30 min de Stripe Checkout)
('service_fee_pct', '0'),                       -- frais de service client (0 au lancement)
('payout_delay_days', '1'),                     -- reversement J+1 après le début de la prestation
('default_sync_interval_minutes', '15'),
('languages', '["fr","en","es"]');

insert into public.site_content (key, value) values
('home.hero', '{"fr":{"title":"Découvrez le monde autrement. Vivez des expériences inoubliables.","subtitle":"Trouvez votre hébergement, explorez les destinations et organisez votre voyage en quelques clics."},
               "en":{"title":"Discover the world differently. Live unforgettable experiences.","subtitle":"Find your stay, explore destinations and plan your trip in a few clicks."},
               "es":{"title":"Descubre el mundo de otra manera. Vive experiencias inolvidables.","subtitle":"Encuentra tu alojamiento, explora destinos y organiza tu viaje en pocos clics."}}');

-- ---------- Stockage (Supabase Storage) ----------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values
      ('listing-media', 'listing-media', true),     -- photos et vidéos des annonces (publiques)
      ('avatars', 'avatars', true),
      ('documents', 'documents', false)             -- factures, itinéraires PDF (privés, liens signés)
    on conflict (id) do nothing;
  end if;
end $$;

-- ---------- Tâches planifiées (pg_cron, à activer dans Supabase : Database > Extensions) ----------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('release-expired-holds', '* * * * *', 'select public.release_expired_holds()');
  end if;
end $$;
-- La synchronisation des calendriers et les reversements sont lancés par des Edge Functions
-- planifiées (voir docs/DEPLOIEMENT.md) : sync-calendars toutes les 5 min, run-payouts toutes les heures.

-- >>>>> 20261108000500_newsletter.sql
-- =====================================================================
-- StayNdiscover — Migration 5 : inscriptions à la newsletter (page d'accueil)
-- Un visiteur peut s'inscrire sans compte ; seul l'admin lit la liste.
-- =====================================================================
create table public.newsletter_subscribers (
  email       text primary key check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  lang        text not null default 'fr' check (lang in ('fr','en','es')),
  created_at  timestamptz not null default now()
);
alter table public.newsletter_subscribers enable row level security;
create policy newsletter_insert on public.newsletter_subscribers for insert with check (true);
create policy newsletter_admin  on public.newsletter_subscribers for select using (public.is_admin());
create policy newsletter_admin_del on public.newsletter_subscribers for delete using (public.is_admin());
grant insert on public.newsletter_subscribers to anon, authenticated;
grant select, delete on public.newsletter_subscribers to authenticated;

-- >>>>> 20261108000600_planner_unlock.sql
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

commit;
