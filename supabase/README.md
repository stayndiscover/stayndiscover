# StayNdiscover : base de données Supabase (phase 1)

Base de données complète de la plateforme : tables, sécurité par rôle (RLS), réservations sans doublon, places d'excursion, paiement en deux temps, commissions, reversements, synchronisation iCal.

## Contenu

```
supabase/
  migrations/
    20261108000100_schema.sql      tables, types, contraintes (dont l'anti double réservation)
    20261108000200_functions.sql   logique métier : paiement, annulation, iCal, avis
    20261108000300_rls.sql         droits de chaque rôle (visiteur, client, prestataire, admin)
    20261108000400_seed.sql        3 destinations, catégories, commission 12 %, réglages
  tests/
    run_tests.sh                   recrée une base vierge et joue tous les tests
    10_scenarios.sql               56 vérifications (droits, paiements, iCal, places, remboursements)
    20_concurrence_*.sql           deux paiements simultanés sur les mêmes dates
```

## Installer sur Supabase

Une fois ton projet Supabase créé (je te guiderai à l'étape 1) :

1. Dans Supabase, ouvre **Database > Extensions** et active `btree_gist` et `pg_cron`.
2. Ouvre **SQL Editor**, puis colle et exécute les 4 fichiers de `migrations/`, **dans l'ordre des numéros**.
3. Inscris-toi sur le site avec ton e-mail, puis exécute dans le SQL Editor (avec ton e-mail) :
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'ton-email@exemple.com');
   ```

Ne lance pas le fichier `tests/00_supabase_stub.sql` sur Supabase : il sert uniquement aux tests en local.

## Lancer les tests (sur un ordinateur avec PostgreSQL 15 ou plus)

```bash
DB=sdtest bash supabase/tests/run_tests.sh
```

Résultat attendu : `==> Tous les scénarios sont passés.` puis `OK  concurrence : …`.

## Ce qui viendra en phase 2

Les fonctions serveur (Edge Functions) qui appellent cette base : création de la session Stripe Checkout, webhook Stripe (autorisation, capture, transferts), synchronisation iCal planifiée, flux iCal public `/ical/<jeton>.ics`, génération des PDF et e-mails. Les fonctions SQL qu'elles utilisent sont déjà en place : `start_checkout`, `authorize_order`, `mark_order_paid`, `fail_order`, `cancel_booking`, `apply_ical_sync`, `record_sync_error`, `connections_due`, `ical_feed`.
