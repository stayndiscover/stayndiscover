-- Supprime toutes les données de démonstration (prestataires fictifs et leurs fiches, fiches de lieux de la démo)
begin;
delete from public.cart_items where listing_id in (select id from public.listings where created_by is not null and (provider_id in (select id from public.providers where legal_info->>'demo' = 'true') or (provider_id is null and slug in ('plage-des-salines', 'jardin-de-balata', 'habitation-clement', 'le-tamarin-cuisine-creole', 'grand-marche-de-fort-de-france', 'morne-larcher', 'anse-noire', 'xunantunich', 'the-split', 'cocina-garifuna-mama-ines', 'marche-de-san-ignacio', 'jardin-majorelle', 'place-jemaa-el-fna-et-souks', 'dar-zitoun', 'palais-de-la-bahia', 'vallee-de-l-ourika-setti-fatma'))));
delete from public.listings where provider_id in (select id from public.providers where legal_info->>'demo' = 'true')
   or (provider_id is null and slug in ('plage-des-salines', 'jardin-de-balata', 'habitation-clement', 'le-tamarin-cuisine-creole', 'grand-marche-de-fort-de-france', 'morne-larcher', 'anse-noire', 'xunantunich', 'the-split', 'cocina-garifuna-mama-ines', 'marche-de-san-ignacio', 'jardin-majorelle', 'place-jemaa-el-fna-et-souks', 'dar-zitoun', 'palais-de-la-bahia', 'vallee-de-l-ourika-setti-fatma'));
delete from public.providers where legal_info->>'demo' = 'true';
commit;
