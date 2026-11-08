# Mettre StaynDiscover en ligne : le guide pas à pas

Compte environ 1 heure. Fais les étapes **dans l'ordre**. Les écrans des sites changent parfois de libellé : si tu ne trouves pas un bouton, fais une capture d'écran et envoie-la à Claude.

> **Règle d'or :** les mots de passe et les clés ne se collent **jamais** dans une conversation. Tu les copies d'un site et tu les colles directement dans un autre (Vercel).

Garde un petit fichier « notes » ouvert pour y coller au fur et à mesure : l'adresse Supabase, l'adresse Vercel. Les clés secrètes, garde-les dans ton gestionnaire de mots de passe.

---

## 1. GitHub : le coffre-fort du code (10 min)

1. Va sur **github.com** → **Sign up**. Crée ton compte avec ton e-mail professionnel.
2. En haut à droite, clique sur **+** → **New repository**.
3. *Repository name* : `stayndiscover`. Coche **Private**. Ne coche rien d'autre. Clique sur **Create repository**.
4. Pour envoyer le code, deux possibilités :
   - **Le plus simple :** dis à Claude « mon dépôt GitHub est prêt : `ton-nom/stayndiscover` ». Il pourra y envoyer le code lui-même si tu lui en donnes l'accès.
   - **À la main :** sur la page du dépôt vide, clique sur **uploading an existing file**. Dézippe `stayndiscover-site.zip` sur ton ordinateur, ouvre le dossier `stayndiscover`, sélectionne **tout son contenu** et glisse-le dans la page. Clique ensuite sur **Commit changes**.

## 2. Supabase : la base de données et les comptes (20 min)

1. Va sur **supabase.com** → **Start your project** → **Continue with GitHub**.
2. **New project** :
   - *Name* : `stayndiscover` ;
   - *Database password* : clique sur **Generate a password**, puis **copie-le dans ton gestionnaire de mots de passe** (tu en auras besoin à l'étape 3) ;
   - *Region* : **Europe, Paris (eu-west-3)** si elle est proposée, sinon Francfort.

   Clique sur **Create new project** et attends 2 minutes.
3. Menu de gauche : **Database** → **Extensions**. Cherche `btree_gist` et active-le, puis cherche `pg_cron` et active-le.
4. Menu de gauche : **SQL Editor**. Pour **chacun** des 5 fichiers du dossier `supabase/migrations`, **dans l'ordre des numéros** (100, 200, 300, 400, 500) :
   1. ouvre le fichier sur ton ordinateur avec le Bloc-notes (Windows) ou TextEdit (Mac) ;
   2. sélectionne tout et copie ;
   3. dans Supabase, clique sur **+** (nouvelle requête), colle, puis clique sur **Run** ;
   4. le message attendu est **Success. No rows returned**.
5. Menu de gauche : **Authentication** → **Sign In / Providers** → **Email** : laisse **Confirm email** activé.
6. Récupère deux informations, que tu colleras dans Vercel :
   - **Project Settings** (roue dentée) → **Data API** : l'**URL du projet** (`https://xxxx.supabase.co`) ;
   - **Project Settings** → **API Keys** : la clé **publishable** (`sb_publishable_...`). Si tu ne vois qu'une clé « anon public », prends celle-là.
7. En haut de la page, clique sur **Connect**, choisis **Transaction pooler** et copie l'adresse qui commence par `postgresql://`. Remplace `[YOUR-PASSWORD]` par le mot de passe de l'étape 2. C'est ta **DATABASE_URL** : elle est secrète.

## 3. Vercel : mettre le site en ligne (10 min)

1. Va sur **vercel.com** → **Sign Up** → **Continue with GitHub** (offre « Hobby » pour commencer).
2. **Add New…** → **Project** → à côté de `stayndiscover`, clique sur **Import**.
3. Ouvre **Environment Variables** et ajoute ces 4 lignes (*Key* à gauche, *Value* à droite) :

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | l'URL du projet (étape 2.6) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la clé publishable (étape 2.6) |
| `DATABASE_URL` | l'adresse du Transaction pooler, avec ton mot de passe (étape 2.7) |
| `NEXT_PUBLIC_SITE_URL` | laisse `https://stayndiscover.vercel.app` pour l'instant : tu corrigeras à l'étape 4 |

4. Clique sur **Deploy** et attends environ 2 minutes. Clique ensuite sur la vignette du site : il est en ligne. Copie son adresse (par exemple `https://stayndiscover-abc.vercel.app`).

## 4. Relier les deux (5 min)

1. **Vercel** → ton projet → **Settings** → **Environment Variables** : remplace la valeur de `NEXT_PUBLIC_SITE_URL` par l'adresse exacte copiée à l'étape 3.4. Ensuite, ouvre **Deployments**, clique sur **⋯** à côté du dernier déploiement, puis sur **Redeploy**.
2. **Supabase** → **Authentication** → **URL Configuration** :
   - *Site URL* : l'adresse de ton site ;
   - *Redirect URLs* → **Add URL** : l'adresse de ton site suivie de `/auth/confirm` (par exemple `https://stayndiscover-abc.vercel.app/auth/confirm`).

## 5. Ton compte administrateur (5 min)

1. Sur ton site, clique sur **Se connecter** → **Créer un compte**, puis inscris-toi avec ton e-mail. Clique sur le lien reçu par e-mail.
2. **Supabase** → **SQL Editor** → nouvelle requête. Colle ceci en remplaçant l'e-mail, puis clique sur **Run** :

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'ton-email@exemple.com');
```

## 6. Facultatif : voir le site rempli (2 min)

Pour tester avec les fiches de la maquette (fictives), colle et exécute dans le **SQL Editor** le fichier `supabase/demo/donnees-demo.sql`.
**Avant d'ouvrir le site au public**, exécute `supabase/demo/supprimer-demo.sql` pour les retirer.

## 7. Vérifier que tout marche

Sur ton téléphone, ouvre le site et vérifie :

- [ ] la page d'accueil s'affiche et les 3 photos défilent ;
- [ ] FR / EN / ES changent bien la langue ;
- [ ] tu peux mettre un cœur sur une fiche ; après connexion, il apparaît aussi sur ton ordinateur ;
- [ ] **Préparer mon séjour** → tu crées un séjour → tu arrives sur tes favoris avec le message « Séjour enregistré » ;
- [ ] tu ajoutes une villa et une excursion au panier.

---

**À faire ensuite, avec Claude :** Stripe (paiement), Google Maps (carte et trajets), Resend (e-mails), le nom de domaine, puis l'espace prestataire et l'administration.
