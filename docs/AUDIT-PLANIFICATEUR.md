# Audit préalable : planificateur intelligent de séjour

Audit réalisé le 8 novembre 2026, avant tout développement, comme le demande la section 2.3 du cahier des charges du planificateur. Il porte sur le site en ligne (https://stayndiscover.vercel.app), le dépôt GitHub et la base Supabase (6 migrations).

> **Remarque :** le cahier des charges reçu s'arrête au milieu de la section 7.6 (« Prévoir une… »). Les sections suivantes (carnet PDF, réservation, accompagnement pendant le séjour…) restent à recevoir.

## 1. Fonctionnalités existantes et opérationnelles

| Domaine | Ce qui fonctionne aujourd'hui |
| --- | --- |
| Comptes | Inscription voyageur ou prestataire, connexion, mot de passe oublié (Supabase Auth). Rôles client, prestataire et admin protégés par la base |
| Catalogue | Destinations, Explorer avec filtres instantanés (destination, catégorie, sous-catégorie, dates, voyageurs, prix, texte), fiches détaillées |
| Fiches | Photos (ou illustration en attendant), description, adresse, GPS, horaires d'ouverture, durée de visite, tarifs, réservation obligatoire ou non, conseils, prestataire, note, lieux à proximité (à vol d'oiseau), bouton « Ouvrir dans Google Maps » |
| Disponibilités | Hébergement : devis réel (tarifs saisonniers, ménage, séjour minimum, capacité) et nuits occupées (réservations et iCal). Excursions : créneaux réels et places restantes. Rien n'est affiché comme disponible sans vérification par la base |
| Favoris | Bouton cœur sur chaque fiche, enregistré dans Supabase, retrouvé sur tous les appareils, page « Mes favoris » |
| Séjours | Plusieurs séjours par compte. Formulaire : destination, dates, heures d'arrivée et de départ, adultes, enfants, hébergement StayNdiscover, plage horaire des activités, rythme (calme, équilibré, intense), budget, préférences en texte libre. À la validation, le séjour est créé, les favoris de la destination y sont ajoutés, puis redirection vers les favoris |
| Sélection du séjour | Ajout et retrait d'activités depuis les fiches et les favoris, carte des activités du séjour |
| Planificateur payant | Essai de 3 activités, puis fenêtre de déblocage à 19,99 € par séjour, sélection conservée. Règle appliquée par la base |
| Panier | Multi-prestataires, revérifié en direct. Paiement à brancher (Stripe) |
| Langues et référencement | FR, EN et ES partout ; référencement complet |

## 2. Fonctionnalités existantes mais incomplètes

| Élément | Écart avec le cahier des charges |
| --- | --- |
| Formulaire de séjour | Une seule page au lieu d'un parcours progressif. Il manque : l'âge des enfants, les informations de transport, un hébergement réservé ailleurs (nom, adresse, GPS, check-in et check-out), le choix « Je n'ai pas encore décidé », les préférences touristiques en cases à cocher, le temps libre, les jours d'activité, le budget par personne ou pour le groupe, plusieurs régions ou étapes, l'affichage du nombre de nuits |
| Favoris | Rattachés au compte et non au séjour. Les activités ajoutées à un séjour (`trip_items`) jouent déjà le rôle de favoris par séjour, à présenter comme tels |
| Accès au planificateur | Le menu affiche « Préparer mon séjour » (le cahier des charges demande « Planifier mon séjour »). La section de l'accueil existe avec un autre texte. Pas de proposition contextuelle après 3 ou 4 fiches consultées, ni après une réservation |
| Rubrique « Mon séjour » | Elle existe (« Mes séjours », favoris, panier, réservations, paiements) mais ne contient ni planning ni carnet de voyage |
| Distances | Calculées à vol d'oiseau, uniquement pour les « lieux à proximité ». Interdit pour les trajets du planning (§ 6.3) |
| Carte | Schématique tant que la clé Google Maps n'est pas configurée |
| Participants | Un nombre par ligne de panier pour les réservations, mais pas encore dans le planning (§ 6.6) |
| Catégories | Il manque : distilleries, musées et monuments, sites naturels, hébergements insolites, activités familiales, excursions terrestres |

## 3. Fonctionnalités manquantes

1. **Moteur de planification** (§ 6), cœur du projet : jours, horaires, repas, pauses, temps libre, retours ; regroupement géographique ; priorité aux créneaux fixes ; horaires d'ouverture ; arrivée et départ ; conflits avec explications et solutions ; variantes détente, équilibré et dynamique.
2. **Trajets routiers réels** (§ 6.3) : distance, durée, mode de transport, heures de départ et d'arrivée, via Google Routes.
3. **Modification du planning** (§ 6.9) : déplacer, changer l'heure, remplacer, réordonner, ajouter du temps libre, relancer l'optimisation, avec recalcul et contrôle des conflits. Les réservations confirmées restent verrouillées.
4. **Itinéraire de chaque journée** (§ 7) : bouton « Démarrer mon itinéraire » (Google Maps prérempli), bouton « Voir mon parcours sur la carte » (étapes numérotées, tracé, distances, durées, marqueurs cliquables), découpage quand il y a trop d'étapes.
5. **Carnet de voyage PDF** et suite du cahier des charges (sections 8 et suivantes, à recevoir).
6. **Paiement réel** (Stripe), pour les réservations issues du planning et le déblocage à 19,99 €.

## 4. Éléments nécessitant une modification

- Le libellé du menu et le texte de la section d'accueil (§ 3.1 et 3.2).
- Le formulaire de séjour, à transformer en parcours progressif en réutilisant les champs actuels.
- La page du séjour, qui devient l'espace « Mon séjour » : sélection, planning par jour, itinéraires, réservations, carnet.
- Le bouton « Organiser mes journées automatiquement » (aujourd'hui, il ouvre la fenêtre de paiement), qui devient « Planifier mon voyage » (§ 5.6).

## 5. Tables Supabase à réutiliser (sans doublon)

| Table ou fonction | Usage dans le planificateur |
| --- | --- |
| `trips` | Le séjour : dates, heures, voyageurs, hébergement, plage horaire, rythme, budget, `plan_generated_at` |
| `trip_items` | La sélection et le planning : jour, heure, durée, trajet, verrouillage, ordre, alertes, notes, créneau d'excursion |
| `favorites` | Favoris du compte, à faire passer dans un séjour |
| `listings` | Lieux : GPS, `google_place_id`, horaires d'ouverture, durée de visite, réservation obligatoire, prix |
| `excursion_slots`, `excursion_schedules` | Créneaux fixes, places restantes, tarifs adultes et enfants, âge maximum enfant |
| `accommodation_units`, `get_unit_busy_nights`, `quote_stay` | Disponibilité et prix de l'hébergement sur toutes les nuits |
| `cart_items`, `orders`, `bookings` | Réservation et paiement depuis le planning ; `bookings` confirmées = étapes verrouillées |
| `planner_unlocks`, `planner_status` | Accès payant au planificateur |
| `categories` | Préférences touristiques (à compléter, voir § 2) |

## 6. Ajouts nécessaires (une seule migration, sans table en double)

- **`trips`**, nouvelles colonnes : âge des enfants, informations de transport, hébergement extérieur (nom, adresse, GPS, check-in, check-out), statut de l'hébergement (réservé, à trouver, indécis), préférences touristiques (liste de catégories), temps libre souhaité, jours d'activité, budget par personne ou pour le groupe, étapes ou régions.
- **`trip_items`**, nouvelles colonnes : type d'étape (activité, repas, temps libre, trajet, retour), heure de fin, participants (adultes, enfants), distance du trajet, mode de transport, état (proposé, confirmé, en conflit).
- **`trip_days`** (nouvelle table, une ligne par jour) : titre ou thème du jour, point de départ s'il diffère de l'hébergement.
- **`travel_times`** (nouvelle table, cache) : trajets déjà calculés par Google Routes entre deux points, pour limiter les coûts Google et accélérer les recalculs.
- **Catégories manquantes** : distilleries, musées et monuments, sites naturels, insolite, activités familiales, excursions terrestres.

## 7. Connexions API existantes

| Service | État |
| --- | --- |
| Supabase (base, comptes) | Branché et en production |
| Google Maps Platform | **Non branché.** Pas de compte Google Cloud ni de clé. Seuls des liens « Ouvrir dans Google Maps » sont générés, sans clé |
| Stripe | Non branché (paiement prévu dans le code, mais pas actif) |
| Resend (e-mails) | Non branché (e-mails Supabase par défaut, en nombre limité) |
| iCal (Airbnb, Booking) | Prêt dans la base, synchronisation planifiée à brancher |

## 8. Intégrations à développer

1. **Google Routes API**, côté serveur : matrice des temps de trajet. C'est indispensable au moteur, puisque le vol d'oiseau est interdit pour les trajets.
2. **Google Maps JavaScript**, pour la carte du parcours avec le tracé.
3. **Liens Google Maps « itinéraire »**, sans clé : départ, étapes, arrivée, mode voiture, découpés quand il y a trop d'étapes (§ 7.6).
4. **Places API**, pour vérifier les coordonnées et les adresses saisies (hébergement extérieur).
5. **Stripe** (réservations et déblocage) et **génération PDF** (carnet).

## 9. Risques de régression et précautions

- **Paiement à 19,99 € :** le blocage au-delà de 3 activités doit rester cohérent avec « Planifier mon voyage » ; il faut décider où se place le déblocage dans le nouveau parcours.
- **Ajout automatique des favoris à la création du séjour :** le comportement actuel est à conserver.
- **Réservations confirmées :** elles ne doivent jamais être déplacées par l'optimisation. On utilise `locked` et le lien avec `bookings`.
- **Coûts Google :** chaque recalcul de trajets est facturé ; le cache `travel_times` et un nombre de recalculs limité y répondent.
- **Sécurité :** toute nouvelle table aura sa protection RLS, avec des tests SQL ajoutés à ceux qui existent.
- **Non-régression :** les 44 vérifications navigateur et les tests SQL actuels sont relancés à chaque étape.
- **Design :** les composants, couleurs et typographies existants sont réutilisés, sans refonte.

## 10. Plan d'intervention proposé

| Phase | Contenu | Dépend de |
| --- | --- | --- |
| **A. Questionnaire et « Mon séjour »** | Migration (colonnes, `trip_days`, `travel_times`, catégories), questionnaire progressif, libellés du menu et de l'accueil, rubrique « Mon séjour », proposition contextuelle discrète, favoris à faire passer dans le séjour | Rien : peut commencer tout de suite |
| **B. Moteur de planification** | Placement des créneaux fixes puis des lieux libres, horaires d'ouverture, repas, rythme, regroupement géographique, arrivée et départ, conflits expliqués, 3 variantes | Clé Google pour les trajets réels. Avant, le moteur est testé avec des trajets d'essai, jamais présentés au client comme réels |
| **C. Itinéraires Google Maps** | « Démarrer mon itinéraire », « Voir mon parcours sur la carte », découpage des étapes | Compte Google Cloud et clé |
| **D. Modification du planning** | Déplacer, réordonner, verrouiller, ajouter du temps libre, réoptimiser, recalcul automatique | B |
| **E. Carnet PDF et suite** | Selon les sections 8 et suivantes du cahier des charges | Texte complet |
| **F. Réservation et paiement** | Depuis le planning, avec Stripe | Compte Stripe |

Chaque phase est testée de bout en bout avant d'être mise en ligne.

## Complément : sections 7.6 à 18 (reçues ensuite)

| Section | Constat | Décision |
| --- | --- | --- |
| 7.6 Nombreuses étapes | Google Maps limite le nombre d'étapes par lien d'itinéraire | Découpage en segments successifs (départ du segment suivant = arrivée du précédent), vue globale de la journée conservée dans StayNdiscover |
| 7.7 Moyens de transport | Aucun choix aujourd'hui | Voiture, marche, vélo, transports en commun (selon les données Google disponibles). Bateau et transferts saisis à part, jamais remplacés par un faux trajet routier |
| 7.8 Actualisation | Pas d'itinéraire stocké | Itinéraire et lien Google Maps enregistrés par jour (`trip_days`), recalculés après chaque modification |
| 8 Calendrier, journée, carte, budget | Seule la carte de la sélection existe | 4 vues dans « Mon séjour ». Le budget distingue les dépenses confirmées, estimées et gratuites |
| 9.1 et 9.2 Panier | Existe : multi-prestataires, revérifié | À ajouter : bouton « Ajouter au panier » depuis le planning, conditions d'annulation et statut affichés sur chaque ligne |
| 9.3 Stripe Connect | Base prête (commission, reversements, remboursements, historique), Stripe non branché | Phase 5. Rappel : depuis la France, Stripe ne reverse pas automatiquement au Maroc ni au Belize (virement manuel prévu) |
| 9.4 FareHarbor | Clés API seulement après un accord de partenariat (vérifié en novembre 2026) | Créneaux saisis dans StayNdiscover ; structure `calendar_connections` prête pour une future connexion |
| 9.5 Amenitiz | Aucune API publique trouvée | iCal (déjà prêt), saisie manuelle |
| 9.6 Airbnb et Booking | API réservées aux partenaires | iCal dans les deux sens (déjà prêt dans la base) |
| 9.7 Prestataires sans API | La base gère déjà calendriers, capacités et créneaux | Écrans de l'espace prestataire à construire |
| 10 Mon séjour | Partiel | Phase 1, ajouts : modifier, **archiver**, indicateur de progression |
| 11 Carnet PDF | Absent | Phase 6 |
| 12 Administration | Base et droits prêts, écrans absents | À construire. Les paramètres du moteur (§ 12.4) seront stockés dans la table `settings` existante |
| 13 Architecture | Le cahier des charges cite WeWeb | **Décision déjà prise avec Marion : Next.js sur Vercel à la place de WeWeb** (voir `CLAUDE-REPRISE.md`). Le reste est identique : Supabase, Stripe, Google Maps |
| 13.1 Données | Correspondances : stays → `trips` ; itineraries, itinerary_days et itinerary_items → `trips`, `trip_days` (nouvelle) et `trip_items` ; travel_routes → `travel_times` (nouvelle) ; carts → `cart_items` ; payments, commissions et provider_payouts → `payments`, `orders.commission_total` et `payouts` ; activity_slots → `excursion_slots` ; booking_participants → `bookings` (adultes et enfants) ; itinerary_documents → stockage `documents` | Aucune table en double |
| 16 Scénario de test | — | Séjour fictif de 7 jours en Martinique, clairement identifié, joué automatiquement à chaque phase |
