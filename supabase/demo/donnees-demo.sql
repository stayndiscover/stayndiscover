-- =====================================================================
-- StaynDiscover : DONNÉES DE DÉMONSTRATION (fictives, reprises de la maquette)
-- Sert à voir le site rempli et à le tester. À NE PAS garder au lancement réel :
-- supprime-les avec supprimer-demo.sql avant d'ouvrir le site au public.
-- Prérequis : avoir créé ton compte sur le site et l'avoir passé en admin.
-- Les 4 prestataires fictifs sont rattachés à ce compte admin.
-- =====================================================================
do $$
declare v_owner uuid; v_prov uuid; v_list uuid; v_unit uuid; v_sched uuid;
begin
  select id into v_owner from public.profiles where role = 'admin' order by created_at limit 1;
  if v_owner is null then
    raise exception 'Crée d''abord ton compte sur le site, puis passe-le en admin (voir le README).';
  end if;
  if exists (select 1 from public.providers where legal_info->>'demo' = 'true') then
    raise notice 'Les données de démonstration sont déjà installées.';
    return;
  end if;

  insert into public.providers (owner_id, trade_name, country_code, destination_id, status, payout_method, approved_at, legal_info, description)
  values (v_owner, 'Kay Lagon Conciergerie', 'FR', (select id from public.destinations where slug = 'martinique'),
          'approved', 'stripe_connect', now(), '{"demo":"true","key":"p1"}', '{"fr":""}');

  insert into public.providers (owner_id, trade_name, country_code, destination_id, status, payout_method, approved_at, legal_info, description)
  values (v_owner, 'Atlas Escapes', 'MA', (select id from public.destinations where slug = 'maroc'),
          'approved', 'manual_transfer', now(), '{"demo":"true","key":"p2"}', '{"fr":""}');

  insert into public.providers (owner_id, trade_name, country_code, destination_id, status, payout_method, approved_at, legal_info, description)
  values (v_owner, 'Sud Caraïbe Loisirs', 'FR', (select id from public.destinations where slug = 'martinique'),
          'approved', 'stripe_connect', now(), '{"demo":"true","key":"p3"}', '{"fr":""}');

  insert into public.providers (owner_id, trade_name, country_code, destination_id, status, payout_method, approved_at, legal_info, description)
  values (v_owner, 'Reef & Jungle Belize', 'BZ', (select id from public.destinations where slug = 'belize'),
          'approved', 'manual_transfer', now(), '{"demo":"true","key":"p4"}', '{"fr":""}');

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p1' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'villa'),
    'hebergement', 'villa-bois-lezard', 'published', '{"fr":"Villa Bois-Lézard","en":"Villa Bois-Lézard","es":"Villa Bois-Lézard"}'::jsonb, '{"fr":"Villa créole avec piscine à débordement et vue sur la baie de Fort-de-France.","en":"Creole villa with infinity pool overlooking the Bay of Fort-de-France.","es":"Villa criolla con piscina infinita frente a la bahía de Fort-de-France."}'::jsonb, 'Anse à l''Âne, Les Trois-Îlets', 14.539, -61.036,
    null, 240, null, false, null, 4.9, v_owner)
  returning id into v_list;
  insert into public.accommodation_units (listing_id, name, max_guests, base_price_night, cleaning_fee, min_nights, check_in_time, check_out_time)
  values (v_list, '{"fr":"Logement entier","en":"Entire place","es":"Alojamiento entero"}'::jsonb, 6, 240, 60, 3, '16:00', '11:00');

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p1' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'studio'),
    'hebergement', 'studio-anse-mitan', 'published', '{"fr":"Studio Anse Mitan","en":"Studio Anse Mitan","es":"Studio Anse Mitan"}'::jsonb, '{"fr":"Studio lumineux à 50 m de la plage, idéal pour un couple.","en":"Bright studio 50 m from the beach, perfect for a couple.","es":"Estudio luminoso a 50 m de la playa, ideal para una pareja."}'::jsonb, 'Anse Mitan, Les Trois-Îlets', 14.552, -61.055,
    null, 85, null, false, null, 4.7, v_owner)
  returning id into v_list;
  insert into public.accommodation_units (listing_id, name, max_guests, base_price_night, cleaning_fee, min_nights, check_in_time, check_out_time)
  values (v_list, '{"fr":"Logement entier","en":"Entire place","es":"Alojamiento entero"}'::jsonb, 2, 85, 21, 2, '15:00', '10:00');

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p3' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'bungalow'),
    'hebergement', 'bungalows-du-morne-gommier', 'published', '{"fr":"Bungalows du Morne Gommier","en":"Bungalows du Morne Gommier","es":"Bungalows du Morne Gommier"}'::jsonb, '{"fr":"Bungalows en bois au milieu d''un jardin tropical, à 5 minutes des plages du sud.","en":"Wooden bungalows in a tropical garden, 5 minutes from the southern beaches.","es":"Bungalós de madera en un jardín tropical, a 5 minutos de las playas del sur."}'::jsonb, 'Sainte-Luce', 14.47, -60.93,
    null, 120, null, false, null, 4.6, v_owner)
  returning id into v_list;
  insert into public.accommodation_units (listing_id, name, max_guests, base_price_night, cleaning_fee, min_nights, check_in_time, check_out_time)
  values (v_list, '{"fr":"Logement entier","en":"Entire place","es":"Alojamiento entero"}'::jsonb, 4, 120, 30, 2, '15:00', '11:00');

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p4' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'belize'), (select id from public.categories where slug = 'bungalow'),
    'hebergement', 'casita-caye-caulker', 'published', '{"fr":"Casita Caye Caulker","en":"Casita Caye Caulker","es":"Casita Caye Caulker"}'::jsonb, '{"fr":"Casita colorée sur pilotis, hamac face au lagon.","en":"Colourful stilt casita with a hammock facing the lagoon.","es":"Casita colorida sobre pilotes, hamaca frente a la laguna."}'::jsonb, 'Front Street, Caye Caulker', 17.745, -88.025,
    null, 110, null, false, null, 4.8, v_owner)
  returning id into v_list;
  insert into public.accommodation_units (listing_id, name, max_guests, base_price_night, cleaning_fee, min_nights, check_in_time, check_out_time)
  values (v_list, '{"fr":"Logement entier","en":"Entire place","es":"Alojamiento entero"}'::jsonb, 3, 110, 28, 2, '14:00', '10:00');

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p4' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'belize'), (select id from public.categories where slug = 'hotel'),
    'hebergement', 'jungle-lodge-san-ignacio', 'published', '{"fr":"Jungle Lodge San Ignacio","en":"Jungle Lodge San Ignacio","es":"Jungle Lodge San Ignacio"}'::jsonb, '{"fr":"Lodge en pleine jungle, réveil au chant des toucans.","en":"Lodge deep in the jungle, wake up to toucans.","es":"Lodge en plena selva, despertar con el canto de los tucanes."}'::jsonb, 'Cayo District, San Ignacio', 17.16, -89.07,
    null, 160, null, false, null, 4.7, v_owner)
  returning id into v_list;
  insert into public.accommodation_units (listing_id, name, max_guests, base_price_night, cleaning_fee, min_nights, check_in_time, check_out_time)
  values (v_list, '{"fr":"Logement entier","en":"Entire place","es":"Alojamiento entero"}'::jsonb, 2, 160, 40, 1, '14:00', '11:00');

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p2' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'maroc'), (select id from public.categories where slug = 'riad'),
    'hebergement', 'riad-dar-yasmine', 'published', '{"fr":"Riad Dar Yasmine","en":"Riad Dar Yasmine","es":"Riad Dar Yasmine"}'::jsonb, '{"fr":"Riad de 5 chambres autour d''un patio planté d''orangers, terrasse sur les toits.","en":"Five-room riad around an orange-tree patio, rooftop terrace.","es":"Riad de 5 habitaciones en torno a un patio de naranjos, terraza en la azotea."}'::jsonb, 'Derb Sidi Bouloukat, Médina, Marrakech', 31.627, -7.988,
    null, 95, null, false, null, 4.9, v_owner)
  returning id into v_list;
  insert into public.accommodation_units (listing_id, name, max_guests, base_price_night, cleaning_fee, min_nights, check_in_time, check_out_time)
  values (v_list, '{"fr":"Logement entier","en":"Entire place","es":"Alojamiento entero"}'::jsonb, 4, 95, 24, 2, '14:00', '12:00');

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p2' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'maroc'), (select id from public.categories where slug = 'hotel'),
    'hebergement', 'camp-agafay-etoiles', 'published', '{"fr":"Camp Agafay Étoiles","en":"Camp Agafay Étoiles","es":"Camp Agafay Étoiles"}'::jsonb, '{"fr":"Tentes berbères tout confort face aux montagnes de l''Atlas.","en":"Comfortable Berber tents facing the Atlas mountains.","es":"Jaimas bereberes con todo el confort frente al Atlas."}'::jsonb, 'Désert d''Agafay, route d''Amizmiz', 31.44, -8.21,
    null, 140, null, false, null, 4.8, v_owner)
  returning id into v_list;
  insert into public.accommodation_units (listing_id, name, max_guests, base_price_night, cleaning_fee, min_nights, check_in_time, check_out_time)
  values (v_list, '{"fr":"Logement entier","en":"Entire place","es":"Alojamiento entero"}'::jsonb, 2, 140, 35, 1, '15:00', '11:00');

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p2' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'maroc'), (select id from public.categories where slug = 'appartement'),
    'hebergement', 'appartement-gueliz-art-deco', 'published', '{"fr":"Appartement Guéliz Art déco","en":"Appartement Guéliz Art déco","es":"Appartement Guéliz Art déco"}'::jsonb, '{"fr":"Appartement rénové dans le quartier moderne, cafés et galeries au pied de l''immeuble.","en":"Renovated flat in the modern district, cafés and galleries downstairs.","es":"Apartamento renovado en el barrio moderno, cafés y galerías a pie de calle."}'::jsonb, 'Rue de la Liberté, Guéliz, Marrakech', 31.636, -8.012,
    null, 60, null, false, null, 4.5, v_owner)
  returning id into v_list;
  insert into public.accommodation_units (listing_id, name, max_guests, base_price_night, cleaning_fee, min_nights, check_in_time, check_out_time)
  values (v_list, '{"fr":"Logement entier","en":"Entire place","es":"Alojamiento entero"}'::jsonb, 4, 60, 15, 2, '14:00', '11:00');

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p1' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'dauphins'),
    'excursion', 'dauphins-et-snorkeling-a-l-anse-noire', 'published', '{"fr":"Dauphins & snorkeling à l''Anse Noire","en":"Dauphins & snorkeling à l''Anse Noire","es":"Dauphins & snorkeling à l''Anse Noire"}'::jsonb, '{"fr":"Sortie en catamaran à la rencontre des dauphins, arrêt snorkeling avec les tortues.","en":"Catamaran trip to meet dolphins, snorkeling stop with turtles.","es":"Salida en catamarán para ver delfines, parada de snorkel con tortugas."}'::jsonb, 'Ponton de Case-Pilote', 14.64, -61.14,
    null, 65, null, true, null, 4.9, v_owner)
  returning id into v_list;
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{1,2,3,4,5,6}', '09:00', 240, 12, 65, 39, 'Ponton de Case-Pilote', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{1,2,3,4,5,6}', '14:00', 240, 12, 65, 39, 'Ponton de Case-Pilote', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p3' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'plongee'),
    'excursion', 'bapteme-de-plongee-au-rocher-du-diamant', 'published', '{"fr":"Baptême de plongée au Rocher du Diamant","en":"Baptême de plongée au Rocher du Diamant","es":"Baptême de plongée au Rocher du Diamant"}'::jsonb, '{"fr":"Première plongée encadrée par un moniteur, au pied du rocher emblématique.","en":"First dive with an instructor at the foot of the iconic rock.","es":"Primer buceo con instructor al pie de la famosa roca."}'::jsonb, 'Club de plongée, Le Diamant', 14.45, -61.04,
    null, 85, null, true, null, 4.8, v_owner)
  returning id into v_list;
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{0,2,4,6}', '09:00', 180, 6, 85, 51, 'Club de plongée, Le Diamant', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{0,2,4,6}', '14:00', 180, 6, 85, 51, 'Club de plongée, Le Diamant', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p3' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'randonnee-guidee'),
    'excursion', 'ascension-de-la-montagne-pelee-avec-guide', 'published', '{"fr":"Ascension de la Montagne Pelée avec guide","en":"Ascension de la Montagne Pelée avec guide","es":"Ascension de la Montagne Pelée avec guide"}'::jsonb, '{"fr":"Randonnée guidée jusqu''au sommet du volcan, panorama sur toute l''île.","en":"Guided hike to the volcano summit, views over the whole island.","es":"Senderismo guiado hasta la cima del volcán, vistas de toda la isla."}'::jsonb, 'Parking de l''Aileron, Le Morne-Rouge', 14.8, -61.17,
    null, 55, null, true, null, 4.7, v_owner)
  returning id into v_list;
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{0,3,6}', '09:00', 360, 10, 55, 33, 'Parking de l''Aileron, Le Morne-Rouge', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p4' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'belize'), (select id from public.categories where slug = 'nautique'),
    'excursion', 'snorkeling-hol-chan-et-shark-ray-alley', 'published', '{"fr":"Snorkeling Hol Chan & Shark Ray Alley","en":"Snorkeling Hol Chan & Shark Ray Alley","es":"Snorkeling Hol Chan & Shark Ray Alley"}'::jsonb, '{"fr":"Snorkeling dans la réserve marine avec raies, tortues et requins-nourrices.","en":"Snorkel the marine reserve with rays, turtles and nurse sharks.","es":"Snorkel en la reserva marina con rayas, tortugas y tiburones gata."}'::jsonb, 'Front Street Pier, Caye Caulker', 17.747, -88.023,
    null, 75, null, true, null, 4.9, v_owner)
  returning id into v_list;
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{0,1,2,3,4,5,6}', '09:00', 240, 14, 75, 45, 'Front Street Pier, Caye Caulker', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{0,1,2,3,4,5,6}', '13:00', 240, 14, 75, 45, 'Front Street Pier, Caye Caulker', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p4' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'belize'), (select id from public.categories where slug = 'plongee'),
    'excursion', 'journee-plongee-au-great-blue-hole', 'published', '{"fr":"Journée plongée au Great Blue Hole","en":"Journée plongée au Great Blue Hole","es":"Journée plongée au Great Blue Hole"}'::jsonb, '{"fr":"Trois plongées dont le célèbre trou bleu, pour plongeurs certifiés.","en":"Three dives including the famous Blue Hole, for certified divers.","es":"Tres inmersiones incluido el famoso Agujero Azul, para buceadores certificados."}'::jsonb, 'Départ Caye Caulker', 17.745, -88.022,
    null, 290, null, true, null, 4.8, v_owner)
  returning id into v_list;
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{1,3,5}', '09:00', 600, 8, 290, 174, 'Départ Caye Caulker', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p4' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'belize'), (select id from public.categories where slug = 'visite-guidee'),
    'excursion', 'grotte-atm-actun-tunichil-muknal', 'published', '{"fr":"Grotte ATM (Actun Tunichil Muknal)","en":"Grotte ATM (Actun Tunichil Muknal)","es":"Grotte ATM (Actun Tunichil Muknal)"}'::jsonb, '{"fr":"Exploration guidée d''une grotte sacrée maya, entre rivière et vestiges.","en":"Guided exploration of a sacred Maya cave, river and relics.","es":"Exploración guiada de una cueva sagrada maya, río y vestigios."}'::jsonb, 'Départ San Ignacio', 17.15, -88.86,
    null, 120, null, true, null, 4.9, v_owner)
  returning id into v_list;
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{0,2,3,4,5,6}', '09:00', 480, 8, 120, 72, 'Départ San Ignacio', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p2' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'maroc'), (select id from public.categories where slug = 'culture'),
    'excursion', 'dromadaire-et-diner-sous-les-etoiles-a-agafay', 'published', '{"fr":"Dromadaire & dîner sous les étoiles à Agafay","en":"Dromadaire & dîner sous les étoiles à Agafay","es":"Dromadaire & dîner sous les étoiles à Agafay"}'::jsonb, '{"fr":"Balade à dos de dromadaire au coucher du soleil puis dîner berbère au camp.","en":"Sunset camel ride followed by a Berber dinner at camp.","es":"Paseo en dromedario al atardecer y cena bereber en el campamento."}'::jsonb, 'Désert d''Agafay (transfert depuis Marrakech)', 31.44, -8.21,
    null, 55, null, true, null, 4.8, v_owner)
  returning id into v_list;
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{0,1,2,3,4,5,6}', '16:00', 300, 20, 55, 33, 'Désert d''Agafay (transfert depuis Marrakech)', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p2' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'maroc'), (select id from public.categories where slug = 'randonnee-guidee'),
    'excursion', 'journee-aux-cascades-d-ouzoud', 'published', '{"fr":"Journée aux cascades d''Ouzoud","en":"Journée aux cascades d''Ouzoud","es":"Journée aux cascades d''Ouzoud"}'::jsonb, '{"fr":"Les plus hautes cascades du Maroc, balade jusqu''au pied des chutes et singes magots.","en":"Morocco''s highest waterfalls, walk to the base and Barbary macaques.","es":"Las cascadas más altas de Marruecos, paseo hasta su base y macacos."}'::jsonb, 'Départ Marrakech', 32.015, -6.719,
    null, 45, null, true, null, 4.6, v_owner)
  returning id into v_list;
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{1,3,5,6}', '09:00', 600, 16, 45, 27, 'Départ Marrakech', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values ((select id from public.providers where legal_info->>'key' = 'p2' and legal_info->>'demo' = 'true'), (select id from public.destinations where slug = 'maroc'), (select id from public.categories where slug = 'experience-locale'),
    'excursion', 'atelier-cuisine-marocaine', 'published', '{"fr":"Atelier cuisine marocaine","en":"Atelier cuisine marocaine","es":"Atelier cuisine marocaine"}'::jsonb, '{"fr":"Marché aux épices puis préparation d''un tajine et de pâtisseries avec une cuisinière.","en":"Spice market then cook a tagine and pastries with a local cook.","es":"Mercado de especias y luego tajín y pasteles con una cocinera local."}'::jsonb, 'Médina, Marrakech', 31.629, -7.99,
    null, 40, null, true, null, 4.9, v_owner)
  returning id into v_list;
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{1,2,3,4,5,6}', '10:00', 180, 10, 40, 24, 'Médina, Marrakech', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);
  insert into public.excursion_schedules (listing_id, weekdays, start_time, duration_min, capacity, price_adult, price_child, meeting_point, valid_from, valid_to)
  values (v_list, '{1,2,3,4,5,6}', '15:00', 180, 10, 40, 24, 'Médina, Marrakech', current_date, current_date + 240)
  returning id into v_sched;
  perform public.generate_slots(v_sched);

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'plage'),
    'lieu', 'plage-des-salines', 'published', '{"fr":"Plage des Salines","en":"Plage des Salines","es":"Plage des Salines"}'::jsonb, '{"fr":"La plage carte postale du sud : cocotiers, sable blanc, eau turquoise.","en":"The south''s postcard beach: palms, white sand, turquoise water.","es":"La playa de postal del sur: cocoteros, arena blanca, agua turquesa."}'::jsonb, 'Sainte-Anne', 14.4, -60.87,
    '{"sun":[["06:00","19:00"]],"mon":[["06:00","19:00"]],"tue":[["06:00","19:00"]],"wed":[["06:00","19:00"]],"thu":[["06:00","19:00"]],"fri":[["06:00","19:00"]],"sat":[["06:00","19:00"]]}'::jsonb, 0, 180, false, '{"fr":"Arriver avant 10 h le week-end.","en":"Arrive before 10am at weekends.","es":"Llegar antes de las 10 h el fin de semana."}'::jsonb, 4.8, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'site-attraction'),
    'lieu', 'jardin-de-balata', 'published', '{"fr":"Jardin de Balata","en":"Jardin de Balata","es":"Jardin de Balata"}'::jsonb, '{"fr":"Jardin botanique et ponts suspendus dans la canopée.","en":"Botanical garden with rope bridges in the canopy.","es":"Jardín botánico con puentes colgantes en la copa de los árboles."}'::jsonb, 'Route de Balata, Fort-de-France', 14.68, -61.1,
    '{"sun":[["09:00","18:00"]],"mon":[["09:00","18:00"]],"tue":[["09:00","18:00"]],"wed":[["09:00","18:00"]],"thu":[["09:00","18:00"]],"fri":[["09:00","18:00"]],"sat":[["09:00","18:00"]]}'::jsonb, 15, 120, false, '{"fr":"Prévoir un anti-moustique.","en":"Bring insect repellent.","es":"Llevar repelente."}'::jsonb, 4.7, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'site-attraction'),
    'lieu', 'habitation-clement', 'published', '{"fr":"Habitation Clément","en":"Habitation Clément","es":"Habitation Clément"}'::jsonb, '{"fr":"Distillerie historique, parc de sculptures et fondation d''art contemporain.","en":"Historic distillery, sculpture park and contemporary art foundation.","es":"Destilería histórica, parque de esculturas y fundación de arte."}'::jsonb, 'Domaine de l''Acajou, Le François', 14.62, -60.9,
    '{"sun":[["09:00","17:00"]],"mon":[["09:00","17:00"]],"tue":[["09:00","17:00"]],"wed":[["09:00","17:00"]],"thu":[["09:00","17:00"]],"fri":[["09:00","17:00"]],"sat":[["09:00","17:00"]]}'::jsonb, 14, 120, false, null, 4.6, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'restaurant'),
    'lieu', 'le-tamarin-cuisine-creole', 'published', '{"fr":"Le Tamarin — cuisine créole","en":"Le Tamarin — cuisine créole","es":"Le Tamarin — cuisine créole"}'::jsonb, '{"fr":"Accras, colombo et poisson grillé les pieds dans le sable.","en":"Accras, colombo and grilled fish with your feet in the sand.","es":"Accras, colombo y pescado a la brasa con los pies en la arena."}'::jsonb, 'Bourg des Anses-d''Arlet', 14.49, -61.08,
    '{"sun":[["12:00","22:00"]],"mon":[["12:00","22:00"]],"tue":[["12:00","22:00"]],"wed":[["12:00","22:00"]],"thu":[["12:00","22:00"]],"fri":[["12:00","22:00"]],"sat":[["12:00","22:00"]]}'::jsonb, 35, 90, false, null, 4.6, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'marche'),
    'lieu', 'grand-marche-de-fort-de-france', 'published', '{"fr":"Grand marché de Fort-de-France","en":"Grand marché de Fort-de-France","es":"Grand marché de Fort-de-France"}'::jsonb, '{"fr":"Épices, punchs et fruits locaux sous la halle métallique.","en":"Spices, rum punches and local fruit under the iron hall.","es":"Especias, ponches y frutas locales bajo el mercado de hierro."}'::jsonb, 'Rue Isambert, Fort-de-France', 14.605, -61.067,
    '{"sun":[],"mon":[["07:00","16:00"]],"tue":[["07:00","16:00"]],"wed":[["07:00","16:00"]],"thu":[["07:00","16:00"]],"fri":[["07:00","16:00"]],"sat":[["07:00","16:00"]]}'::jsonb, 0, 60, false, null, 4.4, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'randonnee'),
    'lieu', 'morne-larcher', 'published', '{"fr":"Morne Larcher","en":"Morne Larcher","es":"Morne Larcher"}'::jsonb, '{"fr":"Montée raide récompensée par la plus belle vue sur le Rocher du Diamant.","en":"Steep climb rewarded by the best view of Diamond Rock.","es":"Subida empinada con la mejor vista de la Roca del Diamante."}'::jsonb, 'Le Diamant', 14.45, -61.06,
    '{"sun":[["06:00","17:00"]],"mon":[["06:00","17:00"]],"tue":[["06:00","17:00"]],"wed":[["06:00","17:00"]],"thu":[["06:00","17:00"]],"fri":[["06:00","17:00"]],"sat":[["06:00","17:00"]]}'::jsonb, 0, 150, false, null, 4.7, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'martinique'), (select id from public.categories where slug = 'spot-photo'),
    'lieu', 'anse-noire', 'published', '{"fr":"Anse Noire","en":"Anse Noire","es":"Anse Noire"}'::jsonb, '{"fr":"Petite crique de sable noir, ponton en bois et tortues au large.","en":"Tiny black-sand cove with a wooden jetty and turtles offshore.","es":"Pequeña cala de arena negra, muelle de madera y tortugas."}'::jsonb, 'Les Anses-d''Arlet', 14.53, -61.09,
    '{"sun":[["07:00","18:00"]],"mon":[["07:00","18:00"]],"tue":[["07:00","18:00"]],"wed":[["07:00","18:00"]],"thu":[["07:00","18:00"]],"fri":[["07:00","18:00"]],"sat":[["07:00","18:00"]]}'::jsonb, 0, 90, false, null, 4.8, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'belize'), (select id from public.categories where slug = 'site-attraction'),
    'lieu', 'xunantunich', 'published', '{"fr":"Xunantunich","en":"Xunantunich","es":"Xunantunich"}'::jsonb, '{"fr":"Cité maya et pyramide El Castillo, accès par bac manuel.","en":"Maya city and El Castillo pyramid, reached by hand-cranked ferry.","es":"Ciudad maya y pirámide El Castillo, acceso en balsa manual."}'::jsonb, 'San José Succotz', 17.089, -89.14,
    '{"sun":[["08:00","16:00"]],"mon":[["08:00","16:00"]],"tue":[["08:00","16:00"]],"wed":[["08:00","16:00"]],"thu":[["08:00","16:00"]],"fri":[["08:00","16:00"]],"sat":[["08:00","16:00"]]}'::jsonb, 10, 120, false, null, 4.8, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'belize'), (select id from public.categories where slug = 'plage'),
    'lieu', 'the-split', 'published', '{"fr":"The Split","en":"The Split","es":"The Split"}'::jsonb, '{"fr":"Le spot baignade et coucher de soleil de Caye Caulker.","en":"Caye Caulker''s swimming and sunset spot.","es":"El lugar de baño y atardecer de Caye Caulker."}'::jsonb, 'Caye Caulker nord', 17.76, -88.03,
    '{"sun":[["07:00","19:00"]],"mon":[["07:00","19:00"]],"tue":[["07:00","19:00"]],"wed":[["07:00","19:00"]],"thu":[["07:00","19:00"]],"fri":[["07:00","19:00"]],"sat":[["07:00","19:00"]]}'::jsonb, 0, 150, false, null, 4.6, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'belize'), (select id from public.categories where slug = 'restaurant'),
    'lieu', 'cocina-garifuna-mama-ines', 'published', '{"fr":"Cocina Garifuna Mama Inés","en":"Cocina Garifuna Mama Inés","es":"Cocina Garifuna Mama Inés"}'::jsonb, '{"fr":"Hudut, poisson coco et plantain : la cuisine garifuna en famille.","en":"Hudut, coconut fish and plantain: family Garifuna cooking.","es":"Hudut, pescado al coco y plátano: cocina garífuna en familia."}'::jsonb, 'Back Street, Caye Caulker', 17.743, -88.026,
    '{"sun":[["12:00","21:00"]],"mon":[["12:00","21:00"]],"tue":[["12:00","21:00"]],"wed":[["12:00","21:00"]],"thu":[["12:00","21:00"]],"fri":[["12:00","21:00"]],"sat":[["12:00","21:00"]]}'::jsonb, 20, 90, false, null, 4.7, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'belize'), (select id from public.categories where slug = 'marche'),
    'lieu', 'marche-de-san-ignacio', 'published', '{"fr":"Marché de San Ignacio","en":"Marché de San Ignacio","es":"Marché de San Ignacio"}'::jsonb, '{"fr":"Le marché du samedi : fruits, artisanat et tamales.","en":"The Saturday market: fruit, crafts and tamales.","es":"El mercado del sábado: frutas, artesanía y tamales."}'::jsonb, 'Savannah Street, San Ignacio', 17.157, -89.07,
    '{"sun":[],"mon":[],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[["06:00","14:00"]]}'::jsonb, 0, 90, false, null, 4.5, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'maroc'), (select id from public.categories where slug = 'site-attraction'),
    'lieu', 'jardin-majorelle', 'published', '{"fr":"Jardin Majorelle","en":"Jardin Majorelle","es":"Jardin Majorelle"}'::jsonb, '{"fr":"Jardin bleu cobalt, cactus et musée berbère.","en":"Cobalt-blue garden, cacti and Berber museum.","es":"Jardín azul cobalto, cactus y museo bereber."}'::jsonb, 'Rue Yves Saint Laurent, Marrakech', 31.641, -8.003,
    '{"sun":[["08:00","18:00"]],"mon":[["08:00","18:00"]],"tue":[["08:00","18:00"]],"wed":[["08:00","18:00"]],"thu":[["08:00","18:00"]],"fri":[["08:00","18:00"]],"sat":[["08:00","18:00"]]}'::jsonb, 15, 90, false, '{"fr":"Réserver un créneau en ligne.","en":"Book a time slot online.","es":"Reservar franja horaria en línea."}'::jsonb, 4.7, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'maroc'), (select id from public.categories where slug = 'marche'),
    'lieu', 'place-jemaa-el-fna-et-souks', 'published', '{"fr":"Place Jemaa el-Fna & souks","en":"Place Jemaa el-Fna & souks","es":"Place Jemaa el-Fna & souks"}'::jsonb, '{"fr":"Conteurs, jus d''orange et dédales des souks.","en":"Storytellers, orange juice and maze-like souks.","es":"Cuentacuentos, zumo de naranja y laberinto de zocos."}'::jsonb, 'Médina, Marrakech', 31.6258, -7.9891,
    '{"sun":[["09:00","23:00"]],"mon":[["09:00","23:00"]],"tue":[["09:00","23:00"]],"wed":[["09:00","23:00"]],"thu":[["09:00","23:00"]],"fri":[["09:00","23:00"]],"sat":[["09:00","23:00"]]}'::jsonb, 0, 120, false, null, 4.5, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'maroc'), (select id from public.categories where slug = 'restaurant'),
    'lieu', 'dar-zitoun', 'published', '{"fr":"Dar Zitoun","en":"Dar Zitoun","es":"Dar Zitoun"}'::jsonb, '{"fr":"Terrasse sur les toits, tajines et pastilla.","en":"Rooftop terrace, tagines and pastilla.","es":"Terraza en la azotea, tajines y pastela."}'::jsonb, 'Kasbah, Marrakech', 31.621, -7.99,
    '{"sun":[["12:00","23:00"]],"mon":[["12:00","23:00"]],"tue":[["12:00","23:00"]],"wed":[["12:00","23:00"]],"thu":[["12:00","23:00"]],"fri":[["12:00","23:00"]],"sat":[["12:00","23:00"]]}'::jsonb, 30, 90, false, null, 4.6, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'maroc'), (select id from public.categories where slug = 'site-attraction'),
    'lieu', 'palais-de-la-bahia', 'published', '{"fr":"Palais de la Bahia","en":"Palais de la Bahia","es":"Palais de la Bahia"}'::jsonb, '{"fr":"Zelliges, plafonds en cèdre et jardins intérieurs.","en":"Zellige tiles, cedar ceilings and inner gardens.","es":"Azulejos, techos de cedro y jardines interiores."}'::jsonb, 'Riad Zitoun el Jdid, Marrakech', 31.622, -7.983,
    '{"sun":[["09:00","17:00"]],"mon":[["09:00","17:00"]],"tue":[["09:00","17:00"]],"wed":[["09:00","17:00"]],"thu":[["09:00","17:00"]],"fri":[["09:00","17:00"]],"sat":[["09:00","17:00"]]}'::jsonb, 7, 75, false, null, 4.6, v_owner)
  returning id into v_list;

  insert into public.listings (provider_id, destination_id, category_id, type, slug, status, title, summary, address, lat, lng,
    opening_hours, price_from, visit_minutes, booking_required, tips, rating_avg, created_by)
  values (null, (select id from public.destinations where slug = 'maroc'), (select id from public.categories where slug = 'point-de-vue'),
    'lieu', 'vallee-de-l-ourika-setti-fatma', 'published', '{"fr":"Vallée de l''Ourika — Setti Fatma","en":"Vallée de l''Ourika — Setti Fatma","es":"Vallée de l''Ourika — Setti Fatma"}'::jsonb, '{"fr":"Villages berbères en terrasses et sentier des sept cascades.","en":"Terraced Berber villages and the seven-waterfall trail.","es":"Pueblos bereberes en terrazas y el sendero de las siete cascadas."}'::jsonb, 'Setti Fatma, Haut Atlas', 31.23, -7.68,
    '{"sun":[["08:00","18:00"]],"mon":[["08:00","18:00"]],"tue":[["08:00","18:00"]],"wed":[["08:00","18:00"]],"thu":[["08:00","18:00"]],"fri":[["08:00","18:00"]],"sat":[["08:00","18:00"]]}'::jsonb, 0, 240, false, null, 4.5, v_owner)
  returning id into v_list;

  -- Quelques nuits déjà prises (comme sur Airbnb) pour voir le calendrier et les refus de dates
  insert into public.unit_blocks (unit_id, period, source, note)
  select u.id, daterange(current_date + 20, current_date + 24), 'manual', 'démo'
    from public.accommodation_units u join public.listings l on l.id = u.listing_id where l.slug = 'villa-bois-lezard';
  raise notice 'Données de démonstration installées : % fiches.', (select count(*) from public.listings);
end $$;
