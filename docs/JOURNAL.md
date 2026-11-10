# Journal des modifications

Demandé par le cahier des charges du planificateur (§ 17) : chaque évolution est notée ici, de la plus récente à la plus ancienne.

## 2026-11-10 — Animations au défilement, parallaxe et avion du logo
- Nouvelle couche components/MotionLayer.tsx + section « Animations » de globals.css. Aucun contenu, aucune mise en page ni fonctionnalité modifiés.
- Apparitions au défilement : titres et cartes en fondu et glissement (en cascade), destinations en zoom, atouts en glissements alternés gauche/droite, bandeau « Planifier » qui s’ouvre, colonnes du pied de page.
- Parallaxe : photo du bandeau d’accueil et des en-têtes de destination, images des cartes destinations.
- Survols discrets : cartes qui se soulèvent, photos qui zooment légèrement, boutons et cœurs.
- Avion : public/images/logo-avion.png est découpé dans le vrai logo (logo.png). Il part exactement de l’avion du logo (le logo reste intact), puis descend avec le défilement en ondulant. Il revient au logo quand on remonte.
- Légèreté : seulement transform/opacity, un seul requestAnimationFrame qui s’arrête à l’arrêt du défilement. Rien ne bouge et rien n’est caché si l’appareil demande moins d’animations ; sécurité : si le script ne démarre pas, le contenu redevient visible après 4 s.

## 2026-11-10 — Effet « nom géant » annulé
- À la demande de Marion, l’accueil revient exactement à la version précédente (fondu entre les photos, sans nom géant).

## 2026-11-08 — Nouvelle fenêtre « séjour Premium »
- Fenêtre de paiement refaite d’après la maquette de Marion : titre selon la destination (« Découvrez l’île autrement ! », le Belize, le Maroc), encadré « Nos pépites locales » avec la photo de la destination, 4 avantages illustrés, prix, bouton « Débloquer mon séjour Premium ». FR/EN/ES, ordinateur et téléphone.
- Pictogrammes dessinés pour le site (pas de logo Google).

## 2026-11-08 — Fenêtre de paiement : explication de l’itinéraire
- Au 6ᵉ cœur (activité, excursion ou lieu), la fenêtre de paiement explique maintenant que l’itinéraire Google Maps est créé jour par jour à partir des favoris (FR/EN/ES).
- Testé : 5 cœurs ajoutés sans paiement, le 6ᵉ ouvre la fenêtre.

## 8 novembre 2026 : catalogue de « Mon séjour » en 3 onglets (demande de Marion)

Les 3 onglets, dans l'ordre :
1. **Hébergements** : disponibilité vérifiée pour les dates du séjour ;
2. **Excursions** : activités payantes, réservables en ligne ;
3. **Lieux à découvrir** : plages, spots photo, restaurants…, sans réservation en ligne.

Chaque onglet a ses sous-filtres par catégorie, et ce qui correspond aux envies du questionnaire est affiché en premier, avec l'étiquette « Selon vos envies ». Le parcours navigateur passe à 61 vérifications.

## 8 novembre 2026 : « Mon séjour » tout-en-un (demande de Marion)

- Sous les informations générales, **tout le catalogue de la destination** : hébergements, excursions, plages, restaurants, spots photo… Il est filtrable par catégorie, avec un filtre « Suggestions selon vos envies » par défaut.
- **Cœur en un clic** pour ajouter ou retirer un élément des favoris du séjour, sans passer par Explorer :
  - activités et lieux : favori du compte + élément du séjour, avec l'essai gratuit de 5 et la fenêtre à 19,99 € au-delà ;
  - hébergements : favori du compte, avec la disponibilité vérifiée sur toutes les nuits pour la taille du groupe.
- La liste « Mes favoris » du séjour regroupe tout, avec la carte et un bouton « Retirer ».
- Aucune modification de la base n'a été nécessaire. Le parcours navigateur passe à 59 vérifications.

## 8 novembre 2026 : planificateur, phase 1 (création du séjour et espace « Mon séjour »)

**Base de données** (migration 7, `mise-a-jour-7-sejour.sql`, à exécuter une fois dans Supabase) :
- `trips` : hébergement (StayNdiscover, réservé ailleurs avec nom, adresse, GPS, check-in et check-out, à trouver, indécis), âges des enfants, transport, régions ou étapes, envies (19 choix), temps libre, jours d'activité, budget par personne ou pour le groupe, archivage, nombre de nuits calculé ;
- `trip_items` : type d'étape, heure de fin, participants, distance et mode de trajet, statut (préparation des phases 3 et 4) ;
- nouvelles tables `trip_days` (journées, itinéraires) et `travel_times` (cache Google Routes), protégées par RLS ;
- 6 catégories ajoutées : distillerie, musée et monument, site naturel, activité familiale, excursion terrestre, hébergement insolite ;
- décision de Marion : **5 activités gratuites par séjour**, puis 19,99 € demandés au clic sur « Planifier mon voyage ».

**Site :**
- menu « Planifier mon séjour » ; section d'accueil « Préparez votre voyage avec StayNdiscover » avec le texte du cahier des charges ;
- questionnaire progressif en 7 étapes (`/sejour/nouveau`), réutilisé pour la modification (`/sejour/<id>/modifier`) ;
- espace « Mon séjour » (`/sejour/<id>`) :
  - indicateur de progression en 6 étapes et bouton « Planifier mon voyage » ;
  - informations générales ;
  - hébergements libres sur toutes les nuits pour la taille du groupe (vérification réelle) ;
  - sélection et carte, favoris à ajouter, suggestions selon les envies ;
  - archivage ;
- liste « Mes séjours » avec les séjours archivés rangés à part ;
- proposition discrète du planificateur après 3 fiches consultées, au plus une fois par mois et jamais si un séjour existe déjà.

**Tests :**
- 15 vérifications SQL ajoutées (`supabase/tests/40_sejour.sql`) ;
- parcours navigateur porté à 55 vérifications, avec un séjour fictif de test de 7 nuits en Martinique.

**Pas encore fait (phases suivantes) :**
- moteur de planification (phase 3) ;
- Google Maps et itinéraires (phase 4, compte Google Cloud requis) ;
- paiement Stripe (phase 5) ;
- carnet PDF (phase 6).
