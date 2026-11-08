# StayNdiscover : note de reprise pour Claude

Ce fichier résume tout le travail déjà fait et les décisions prises, pour reprendre le projet dans une nouvelle conversation sans rien redemander. Lis-le en entier avant de répondre.

## Le projet

StayNdiscover (le logo écrit « StayNdiscover ») est une plateforme touristique internationale créée par Marion, community manager et directrice artistique freelance basée en Martinique. Elle n'est pas développeuse.

- **Destinations de départ :** Martinique, Belize, Maroc. D'autres doivent pouvoir s'ajouter sans toucher au code.
- **Parcours visé :** découvrir → enregistrer → planifier → réserver → payer → voyager.
- **Langues :** français, anglais, espagnol, partout (y compris dans les espaces client, prestataire et admin).
- **Le cahier des charges complet est dans `01-cahier-des-charges/`** (deux fichiers : sections 1 à 7, puis 8 à 15). C'est la référence.

## Décisions déjà prises avec Marion

| Sujet | Décision |
| --- | --- |
| Type de site | Vraie application fonctionnelle, pas une vitrine (section 15 du cahier des charges) |
| Interface | Application codée en **Next.js**, hébergée sur **Vercel** (choisie à la place de WeWeb) |
| Base de données, comptes, stockage | **Supabase** |
| Paiements | **Stripe Connect**, montage « separate charges and transfers » |
| Cartes et trajets | **Google Maps Platform** (Maps JavaScript, Places, Routes) |
| Mise en ligne | **Marion le fait elle-même, guidée pas à pas** (clic par clic, en français simple) |
| Comptes existants | **Aucun pour l'instant** (ni Supabase, ni Stripe, ni Google Cloud, ni GitHub, ni Vercel) |
| Commission | 12 % hébergements et excursions, modifiable par l'admin |
| Devise | Euro pour les trois destinations |
| Logo | Fichier `05-images-originales/logo-original.png`, déjà intégré à la maquette |

## Ce qui est terminé

1. **Maquette interactive** (`02-maquette-site/index.html`) : un seul fichier HTML qui montre tout le parcours en FR / EN / ES avec des données fictives enregistrées dans le navigateur. Elle contient :
   - l'accueil, avec un diaporama des 3 photos qui se fige sur la destination choisie ;
   - les pages destinations, le catalogue et les fiches ;
   - les favoris, les séjours et le planificateur (calendrier, chronologie, carte, budget, itinéraire) ;
   - le panier et un paiement simulé ;
   - l'espace prestataire et l'administration.

   Elle sert de **référence visuelle et fonctionnelle** pour le vrai site. Pour l'ouvrir, il suffit de lancer `index.html` dans un navigateur (le dossier `images/` doit rester à côté).
2. **Phase 1 : conception**, dans `03-conception/StayNdiscover-conception-technique.pdf` : architecture, rôles et permissions, base de données, flux de paiement et de synchronisation, limites des API, plan en 7 étapes, points juridiques.
3. **Base de données Supabase** dans `04-base-de-donnees/` :
   - 4 migrations SQL : 29 tables, sécurité par rôle (RLS), fonctions métier ;
   - testée sur PostgreSQL 16 : 56 vérifications réussies, plus un test de deux paiements simultanés ;
   - le mode d'emploi est dans le `README.md` de ce dossier.

4. **Application Next.js (étapes 2 et 3 du plan), dans ce dépôt** :
   - site public : accueil, destinations, catalogue, fiches avec devis et créneaux réels, carte ;
   - comptes Supabase Auth, espace client (profil, favoris, plusieurs séjours, panier multi-prestataires) ;
   - FR / EN / ES ;
   - testée le 8 novembre 2026 sur une base locale identique à Supabase : 31 vérifications dans un vrai navigateur (`tests/parcours.mjs`), en mode développement et en version de production, plus les 56 tests SQL.

   Choix techniques à connaître :
   - le site lit la base **en connexion directe** (`DATABASE_URL`, Transaction pooler), avec l'identité de la personne (`set local role authenticated` + `request.jwt.claim.sub`) : la RLS s'applique donc à tout ;
   - Supabase Auth gère les comptes, via `@supabase/ssr` et des cookies ;
   - les fiches sans photo affichent les illustrations générées de la maquette ;
   - les données de démonstration sont dans `supabase/demo/` ;
   - une migration 5 ajoute la table `newsletter_subscribers`.
   - **Planificateur payant** (demande de Marion, 8 novembre 2026) :
     - essai gratuit de 3 activités par séjour, puis fenêtre de déblocage à 19,99 € par séjour ; la sélection est conservée ;
     - migration 6 : table `planner_unlocks`, réglages `planner_price` et `planner_free_items`, trigger `trip_items_paywall`, fonctions `planner_status`, `request_planner_unlock` et `mark_planner_unlock_paid` (rôle service uniquement) ;
     - côté site : `unlockPlanner` dans `app/actions.ts` et `components/PlannerPaywall.tsx` ;
     - **à l'étape Stripe :** créer la session Checkout dans `unlockPlanner` (19,99 €, 100 % pour la plateforme, sans Connect), puis appeler `mark_planner_unlock_paid` depuis le webhook.
   - **Référencement** (fait le 8 novembre 2026) :
     - `lib/seo.ts` (`pageMeta`, `privateMeta`), `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts` ;
     - données schema.org sur chaque page publique ; la note n'est publiée que s'il y a de vrais avis ;
     - les recherches filtrées (texte, prix, dates) sont en noindex ;
     - `next/image` en AVIF/WebP ;
     - variable facultative `GOOGLE_SITE_VERIFICATION` ;
     - contrôle : `tests/seo.mjs` (avec l'agent Googlebot, car Next 16 envoie les métadonnées en différé aux navigateurs normaux).

Fonctions SQL déjà prêtes pour les fonctions serveur de la phase 2 :

| Fonction | Rôle |
| --- | --- |
| `start_checkout()` | Revérifie le panier, tient les dates et les places 35 min, crée la commande |
| `attach_checkout_session()` | Rattache la session Stripe Checkout à la commande |
| `authorize_order()` | Renvoie `capture` ou `cancel` : on ne débite que si les dates sont encore tenues |
| `mark_order_paid()` | Confirme les réservations, planifie les reversements, crée la facture, notifie |
| `fail_order()` | Libère tout si la capture échoue |
| `cancel_booking()` | Annule selon la politique de l'annonce et crée le remboursement en attente |
| `apply_ical_sync()`, `record_sync_error()`, `connections_due()` | Import iCal, alertes de conflit et d'erreur |
| `ical_feed(token)` | Flux iCal exporté vers Airbnb ou Booking |
| `generate_slots()`, `quote_stay()`, `get_unit_busy_nights()`, `release_expired_holds()` | Créneaux d'excursion, devis, calendrier public, nettoyage des tenues |

## Limites vérifiées (novembre 2026)

- **Airbnb :** API réservée aux partenaires approuvés, plus de nouvelles demandes acceptées. **Booking.com :** API réservée aux partenaires de connectivité. Solution retenue : iCal dans les deux sens, et le temps réel via le channel manager de l'hébergeur s'il en a un.
- **FareHarbor :** clés API seulement après un accord de partenariat. **Amenitiz :** aucune API publique trouvée. Solution retenue : saisie des créneaux dans StayNdiscover au lancement, et demandes d'accès à faire en parallèle.
- **Stripe :** depuis une plateforme française, les reversements automatiques ne vont que vers les États-Unis, le Royaume-Uni, l'EEE, le Canada et la Suisse. La Martinique est couverte : Stripe l'accepte comme la France. **Maroc et Belize : virement manuel**, enregistré dans l'administration (`payout_method = manual_transfer`).
- **Juridique, à faire valider par un avocat :** vendre ensemble un hébergement et des excursions peut constituer un forfait touristique, avec immatriculation Atout France et garantie financière à la clé. Autres points : TVA, déclaration DAC7, CGV et RGPD.

## Mise en ligne (8 novembre 2026)

- **Comptes créés :**
  - GitHub `stayndiscover/stayndiscover`, en privé ; Claude peut y envoyer les modifications ;
  - Supabase : projet `exhscxazatsiragpzbzr`, Europe, avec les 6 migrations installées et vérifiées (31 tables, toutes protégées par RLS) ;
  - Vercel : https://stayndiscover.vercel.app, avec les 4 variables d'environnement.
- **Compte de Marion :** stayndiscover@gmail.com, passé en admin ; les données de démonstration sont installées.
- **Chaque `git push` sur `main` redéploie le site automatiquement.**
- **Accueil :**
  - le menu est réduit à Destinations, Explorer et Préparer mon séjour ;
  - le diaporama est animé ;
  - une vidéo par destination est possible dans `public/videos/<destination>.mp4`. `maroc.mp4` est en place, avec le filigrane KlingAI de la version gratuite, que Marion accepte pour l'instant. **À remplacer par une version sans filigrane avant l'ouverture au public.** Les vidéos de la Martinique (vagues) et du Belize ne sont pas encore faites.
- **À faire avant l'ouverture au public :**
  - retirer les données de démonstration (`supabase/demo/supprimer-demo.sql`) ;
  - brancher le nom de domaine, puis mettre à jour `NEXT_PUBLIC_SITE_URL` et les URL d'Auth dans Supabase.

## Prochaine étape

1. **Mise en ligne par Marion**, en suivant `docs/GUIDE-MISE-EN-LIGNE.md` (GitHub, Supabase, Vercel, compte admin). Si elle donne l'accès à son dépôt GitHub, Claude peut y envoyer le code.
2. **Ensuite**, dans l'ordre :
   - Stripe Connect (Checkout, webhook vers `authorize_order`, `mark_order_paid` et `fail_order`, transferts) : le bouton « Payer » du panier attend cette étape, ainsi que le déblocage du planificateur à 19,99 € ;
   - espace prestataire et administration ;
   - planificateur automatique (Google Routes) et PDF ;
   - e-mails (Resend) et synchronisation iCal planifiée ;
   - nom de domaine.

## Façon de travailler avec Marion

- **Langue :** elle écrit en français, souvent rapidement. Réponds en français clair, sans jargon inutile.
- **Clés secrètes :** ne lui demande jamais de les coller dans la conversation. Elle les saisit elle-même dans les réglages de Supabase ou de Vercel.
- **Tests :** teste chaque étape réellement avant de la déclarer terminée, comme l'exige la section 15 du cahier des charges.
- **Code :** il doit vivre sur GitHub dès l'étape 1, pour pouvoir le reprendre d'une conversation à l'autre.
- **Orthographe :** décidée par Marion le 8 novembre 2026 : « StayNdiscover » partout (comme le logo). Les adresses et identifiants techniques restent en minuscules (`stayndiscover`).
