# StayNdiscover : l'application

Plateforme touristique (Martinique, Belize, Maroc) : découvrir → enregistrer → planifier → réserver → payer → voyager.
Next.js 16 (App Router) hébergé sur Vercel, Supabase (base PostgreSQL, comptes, stockage), en français, anglais et espagnol.

- **Pour mettre le site en ligne :** suivre `docs/GUIDE-MISE-EN-LIGNE.md`, pas à pas.
- **Pour reprendre le projet avec Claude :** lui donner `docs/CLAUDE-REPRISE.md`.

## Ce qui fonctionne (étapes 2 et 3 du plan)

| Partie | Détail |
| --- | --- |
| Site public | Accueil (diaporama figé sur la destination choisie, moteur de recherche), destinations, catalogue avec filtres et recherche, fiches détaillées, carte, « Ouvrir dans Google Maps », lieux à proximité, newsletter |
| Disponibilités réelles | Devis calculé par la base (tarifs saisonniers, ménage, séjour minimum), nuits occupées sur 60 jours, recherche par dates, créneaux d'excursion avec places restantes |
| Comptes | Inscription voyageur ou prestataire, connexion, mot de passe oublié, confirmation par e-mail, déconnexion (Supabase Auth) |
| Espace client | Profil, favoris synchronisés sur tous les appareils, plusieurs séjours, création d'un séjour qui enregistre et redirige vers les favoris, ajout et retrait d'activités, panier multi-prestataires revérifié en direct, réservations et paiements |
| Langues | FR / EN / ES dans l'adresse (`/fr`, `/en`, `/es`), choix mémorisé |

**Pas encore fait (étapes suivantes) :** paiement Stripe (le bouton « Payer » est désactivé avec un message), espace prestataire et administration, planificateur automatique avec trajets Google Routes, PDF, e-mails, synchronisation iCal planifiée.

## Organisation du code

```
app/[lang]/          pages (accueil, destinations, explorer, fiches, connexion, compte, favoris, sejour, panier, informations)
app/actions.ts       actions serveur : comptes, favoris, séjours, panier, newsletter
app/api/quote/       devis d'un séjour (appelé par la fiche hébergement)
app/auth/confirm/    lien reçu par e-mail (confirmation, mot de passe oublié)
components/          en-tête, cartes, formulaires de réservation, carte, diaporama…
lib/db.ts            connexion à la base : chaque requête porte l'identité de la personne → les règles RLS s'appliquent
lib/catalog.ts       lecture du catalogue
lib/i18n.ts          traductions (lib/dict-base.ts reprend celles de la maquette)
proxy.ts             langue dans l'adresse + rafraîchissement de la session
supabase/            migrations (5), tests SQL, données de démonstration
tests/parcours.mjs   test du parcours voyageur dans un vrai navigateur (31 vérifications)
```

La sécurité repose sur la base : le site se connecte avec l'identité vérifiée de la personne (`set role authenticated` + identifiant), donc un client ne peut lire ou modifier que ses propres données, même en cas d'erreur dans le code du site.

## Réglages (variables d'environnement)

Voir `.env.example`. À saisir dans Vercel, jamais dans le code ni dans une conversation.

## Tester sur un ordinateur (développeur)

Prérequis : Node 20+, PostgreSQL 15+.

```bash
npm install
bash scripts/local-db.sh                         # base locale « stayndiscover », comme un projet Supabase neuf
DATABASE_URL=postgres://USER:MDP@localhost/stayndiscover node scripts/local-auth.mjs &   # doublure locale de Supabase Auth
cp .env.example .env.local                       # puis : URL http://localhost:54321, DATABASE_URL locale
npm run dev
# compte admin + données de démo : s'inscrire sur le site, passer le compte en admin (voir le guide), puis
psql -d stayndiscover -f supabase/demo/donnees-demo.sql
npx playwright install chromium && node tests/parcours.mjs
(cd supabase && bash tests/run_tests.sh)         # 56 vérifications SQL + test de concurrence
```

`scripts/local-auth.mjs` ne sert qu'aux tests locaux : en ligne, c'est le vrai Supabase Auth.
