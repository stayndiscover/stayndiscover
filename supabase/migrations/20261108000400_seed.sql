-- =====================================================================
-- StaynDiscover — Migration 4/4 : données de départ et tâches planifiées
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
