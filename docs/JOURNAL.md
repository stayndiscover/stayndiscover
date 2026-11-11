# Journal des modifications

Demandé par le cahier des charges du planificateur (§ 17) : chaque évolution est notée ici, de la plus récente à la plus ancienne.

## 2026-11-11 — Ouverture : logo visible jusqu’au bout
- Le logo reste affiché pendant tout le dévoilement (seule la phrase « Faites défiler… » s’efface au premier défilement).
- Ordre des couches : drap < logo < câbles < avion — l’avion passe au-dessus du logo.
- Quand le dernier morceau de drap part, le logo, l’avion et les câbles disparaissent ensemble en fondu. Le drap finit exactement à la fin de la piste de défilement.

## 2026-11-11 — Ouverture : le logo se construit morceau par morceau
- Sur le voile, le logo est découpé en 37 morceaux (public/images/logo-pieces.png + lib/logo-pieces.ts, recomposition identique au logo d’origine) qui arrivent l’un après l’autre : le pin, la maison et ses 4 fenêtres, le palmier, les montagnes, les 3 vagues, la flèche qui se dessine, les tirets du trajet, l’avion qui arrive en volant, puis les 13 lettres. Ensuite « Faites défiler pour lever le voile ». Montage complet en 4,5 s environ. Avion et voile inchangés.
- Note tests : la nuit bloquée de démonstration de la villa est fixée à la date d’installation (+20 à +24 jours) ; si le test « dates bloquées » échoue quelques jours plus tard, il suffit de recaler cette période.

## 2026-11-10 — Ouverture : avion vu du dessus
- L’avion qui tracte le voile est maintenant vu du dessus : public/images/avion-dessus.svg (même modèle à aile haute que le logo, turquoise du logo, relief par dégradés, pare-brise, feux de bout d’aile, hélice qui tourne). Son ombre reste toujours en bas à droite, comme sous une lumière venant du haut à gauche. Remplace avion-3d.png.
- Le petit avion du logo qui descend avec le défilement reste celui du logo (vu de profil).

## 2026-11-10 — Ouverture de l’accueil : le voile tracté par l’avion
- components/VeilIntro.tsx : un drap blanc couvre l’écran à l’arrivée sur l’accueil (logo + « Faites défiler pour lever le voile »). En faisant défiler, l’avion du logo (public/images/avion-3d.png : même avion, agrandi et ombré en relief, hélice qui tourne) tire le coin bas-droit au bout de deux câbles et soulève le drap en diagonale vers le haut à gauche.
- Drap calculé en 3D (maillage + éclairage WebGL) : rouleau du pli, rabat qui se soulève vers l’avion avec perspective, plis qui rayonnent vers le coin tiré, ondulations légères, ombre portée sur la page dévoilée.
- Pendant le dévoilement (« piste » de 115 % de la hauteur d’écran, 95 % sur téléphone), le bandeau d’accueil reste immobile (sticky) puis la page défile normalement. Le bandeau occupe désormais au moins toute la hauteur de l’écran.
- L’avion du logo (MotionLayer) ne part qu’après le dévoilement. Sans WebGL : drap plat de secours. Si l’appareil demande moins d’animations : ni drap, ni piste.

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
