-- =====================================================================
-- StaynDiscover — schéma principal (Supabase / PostgreSQL 15+)
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
