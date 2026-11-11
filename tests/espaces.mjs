// Test des espaces prestataire et administration dans un vrai navigateur (Chromium).
// Usage : BASE=http://localhost:3001 node tests/espaces.mjs   (base locale + scripts/local-auth.mjs)
// Promotion admin : le test passe par psql (comme Marion l'a fait dans Supabase) via la variable PSQL_DB.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:3000';
const DB = process.env.PSQL_DB || 'stayndiscover';
const sql = (q) => execSync(`psql -d ${DB} -Atc ${JSON.stringify(q)}`).toString().trim();
let n = 0, fail = 0;
const TRADE = `Kay Lagon Excursions (test ${Date.now() % 1e6})`;
const ok = (cond, label) => { n++; if (cond) console.log('OK  ', label); else { fail++; console.log('ÉCHEC', label); } };

const b = await chromium.launch();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAGklEQVR4nGP4z8CAFTEMNQkGBgYGBob/DAwAPTwE/H8n6EUAAAAASUVORK5CYII=', 'base64');
fs.writeFileSync('/tmp/sd-photo.png', png);

const errors = [];
async function newUser(kind, name) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  const email = `${kind}${Date.now()}@test.fr`;
  await p.goto(`${BASE}/fr/connexion`, { waitUntil: 'networkidle' });
  await p.getByRole('tab', { name: 'Créer un compte' }).click();
  await p.waitForSelector('input[name=full_name]');
  await p.fill('input[name=full_name]', name);
  await p.fill('input[name=email]', email);
  await p.fill('input[name=password]', 'motdepasse123');
  if (kind === 'pro') await p.locator('input[name=account_type][value=provider]').check();
  await p.getByRole('button', { name: 'Créer un compte' }).last().click();
  await p.waitForURL((u) => !u.pathname.endsWith('/connexion'));
  return { p, email, ctx };
}
const go = (p, u) => p.goto(BASE + u, { waitUntil: 'networkidle' });
/** Clique puis attend le retour de l'action (l'adresse change à chaque retour grâce au paramètre v). */
async function act(p, locator, re = /[?&](ok|err)=/) {
  const before = p.url();
  await locator.click();
  await p.waitForURL((u) => u.href !== before && re.test(u.href));
  await p.waitForLoadState('networkidle');
}
const notice = async (p) => (await p.locator('.notice.ok, .notice.bad').allInnerTexts()).join(' / ');

// ---------- 1. Prestataire
const pro = await newUser('pro', 'Kay Lagon');
await go(pro.p, '/fr/compte');
ok(await pro.p.getByRole('link', { name: 'Espace prestataire →' }).count() === 1, 'compte prestataire : accès « Espace prestataire » depuis Mon compte');
await go(pro.p, '/fr/admin');
ok(await pro.p.locator('h1').innerText().then((t) => !t.includes('Administration')), 'prestataire : l\'administration lui est fermée');
await go(pro.p, '/fr/pro');
ok(await pro.p.getByText('Commencez par remplir votre profil professionnel').count() >= 1, 'espace prestataire : demande de remplir le profil');
await go(pro.p, '/fr/pro/profil');
await pro.p.fill('input[name=trade_name]', TRADE);
await pro.p.fill('input[name=email]', 'contact@kaylagon.test');
await pro.p.selectOption('select[name=destination_id]', { label: 'Martinique' });
await pro.p.fill('textarea[name=pdesc_fr]', 'Sorties en catamaran au départ du Marin.');
await pro.p.fill('textarea[name=bank]', 'FR76 0000 0000 0000 0000 0000 000');
await pro.p.setInputFiles('input[name=logo]', '/tmp/sd-photo.png');
await pro.p.getByRole('button', { name: 'Enregistrer' }).click();
await pro.p.waitForURL(/\/pro\/profil\?ok=saved/);
ok(await pro.p.locator('.pill', { hasText: 'À valider' }).count() === 1, 'profil professionnel créé, en attente de validation');
ok(sql(`select logo_path is not null from providers where trade_name = '${TRADE}'`) === 't', 'profil professionnel : logo envoyé');

await go(pro.p, '/fr/pro/annonces/nouvelle');
await pro.p.selectOption('select[name=type]', 'excursion');
await pro.p.selectOption('select[name=destination_id]', { label: 'Martinique' });
await pro.p.selectOption('select[name=category_id]', { label: '— Excursion en bateau' });
await pro.p.fill('input[name=title_fr]', 'Catamaran test aux Salines');
await pro.p.fill('input[name=title_en]', 'Test catamaran to Les Salines');
await pro.p.fill('textarea[name=summary_fr]', 'Journée en catamaran, baignade et déjeuner.');
await pro.p.fill('input[name=address]', 'Marina du Marin, Le Marin');
await pro.p.fill('input[name=lat]', '14.4686'); await pro.p.fill('input[name=lng]', '-60.8706');
await pro.p.fill('input[name=price_from]', '95');
await pro.p.fill('input[name=cancel_free_hours]', '48'); await pro.p.fill('input[name=cancel_refund_pct]', '0');
await pro.p.fill('input[name=h_mon]', '08:00-17:00');
await pro.p.getByRole('button', { name: 'Enregistrer' }).click();
await pro.p.waitForURL(/\/pro\/annonces\/[0-9a-f-]{36}\?ok=saved/);
const lid = pro.p.url().match(/annonces\/([0-9a-f-]{36})/)[1];
ok(await pro.p.locator('.pill', { hasText: 'Brouillon' }).count() >= 1, 'prestataire : annonce créée en brouillon');
ok(sql(`select opening_hours->'mon'->0->>0 || ' ' || (cancellation_policy->>'free_until_hours') from listings where id = '${lid}'`) === '08:00 48', 'horaires et conditions d\'annulation enregistrés');

// photo
await pro.p.setInputFiles('input[name=files]', '/tmp/sd-photo.png');
await act(pro.p, pro.p.locator('button', { hasText: 'Ajouter des photos' }), /[?&]ok=saved/);
ok(await pro.p.locator('.media-grid img').count() === 1, 'prestataire : photo envoyée et affichée');
const imgOk = await pro.p.locator('.media-grid img').evaluate((i) => i.complete && i.naturalWidth > 0);
ok(imgOk, 'la photo est bien lisible depuis le stockage');

// horaires et départs
await pro.p.fill('#horaires input[name=price_adult]', '95');
await pro.p.fill('#horaires input[name=price_child]', '60');
await pro.p.fill('#horaires input[name=meeting_point]', 'Ponton C, marina du Marin');
await act(pro.p, pro.p.getByRole('button', { name: 'Ajouter', exact: true }), /[?&]ok=saved/);
ok(await pro.p.locator('#horaires tbody tr').count() === 1, 'prestataire : horaire d\'excursion ajouté (jours, heure, places, prix)');
await act(pro.p, pro.p.getByRole('button', { name: 'Créer les départs des 90 prochains jours' }), /[?&]ok=slots/);
const made = Number((await notice(pro.p)).match(/(\d+) départ/)?.[1] ?? 0);
ok(made > 50, `prestataire : ${made} départs créés pour 90 jours`);
await act(pro.p, pro.p.locator('.slots-list button', { hasText: 'Fermer' }).first(), /[?&]ok=saved/);
ok(await pro.p.locator('.slots-list .pill', { hasText: 'closed' }).count() === 1, 'prestataire : un départ fermé (météo, privatisation…)');

await act(pro.p, pro.p.getByRole('button', { name: 'Envoyer en validation' }), /[?&]ok=submitted/);
ok(await pro.p.locator('.pill', { hasText: 'En attente de validation' }).count() >= 1, 'prestataire : annonce envoyée en validation');
ok(sql(`select status from listings where id = '${lid}'`) === 'pending', 'base : annonce « pending », pas publiée');
await go(pro.p, `/fr/destinations/martinique/catamaran-test-aux-salines`);
ok((await pro.p.title()).includes('introuvable') || (await pro.p.locator('h1').innerText()).includes('introuvable') || await pro.p.locator('text=404').count() > 0,
  'l\'annonce non validée n\'apparaît pas sur le site');

// ---------- 2. Administrateur
const adm = await newUser('admin', 'Admin Test');
sql(`update profiles set role = 'admin' where id = (select id from auth.users where email = '${adm.email}')`);
await go(adm.p, '/fr/admin');
ok(await adm.p.locator('h1', { hasText: 'Administration' }).count() === 1, 'administrateur : tableau de bord');
ok(await adm.p.locator('.kpi').count() >= 12, 'tableau de bord : clients, prestataires, annonces, réservations, CA, commissions…');
ok(await adm.p.getByRole('link', { name: /Annonces à valider/ }).count() === 1, 'tableau de bord : raccourci « annonces à valider »');

await go(adm.p, '/fr/admin/prestataires?status=pending');
const row = adm.p.locator('tr', { hasText: TRADE });
await act(adm.p, row.getByRole('button', { name: 'Valider' }), /[?&]ok=saved/);
ok(sql(`select status from providers where trade_name = '${TRADE}'`) === 'approved', 'admin : inscription professionnelle validée');

await go(adm.p, `/fr/admin/annonces/${lid}`);
await act(adm.p, adm.p.getByRole('button', { name: /Demander de meilleures photos/ }), /[?&]ok=saved/);
ok(sql(`select status from listings where id = '${lid}'`) === 'changes_requested', 'admin : demande de photos plus qualitatives');
await go(pro.p, '/fr/pro');
ok(await pro.p.getByText('Les photos ne sont pas encore assez qualitatives').count() >= 1, 'le prestataire voit la demande dans ses notifications');
await go(adm.p, `/fr/admin/annonces/${lid}`);
await act(adm.p, adm.p.getByRole('button', { name: /Valider et mettre en ligne/ }), /[?&]ok=saved/);
ok(sql(`select status from listings where id = '${lid}'`) === 'published', 'admin : annonce validée et publiée');
await go(adm.p, '/fr/destinations/martinique/catamaran-test-aux-salines');
ok(await adm.p.locator('h1', { hasText: 'Catamaran test aux Salines' }).count() === 1, 'l\'annonce validée est en ligne sur le site');

// admin crée un lieu (plage) lui-même
await go(adm.p, '/fr/admin/annonces/nouvelle');
await adm.p.selectOption('select[name=type]', 'lieu');
await adm.p.selectOption('select[name=destination_id]', { label: 'Martinique' });
await adm.p.selectOption('select[name=category_id]', { label: 'Plage' });
await adm.p.fill('input[name=title_fr]', 'Anse test Michel');
await adm.p.fill('input[name=google_maps_url]', 'https://maps.google.com/?q=Anse+Michel');
await adm.p.getByRole('button', { name: 'Enregistrer' }).click();
await adm.p.waitForURL(/\/admin\/annonces\/[0-9a-f-]{36}\?ok=saved/);
ok(await adm.p.locator('h1', { hasText: 'Anse test Michel' }).count() === 1, 'admin : fiche « plage » créée avec un simple lien Google Maps');
await act(adm.p, adm.p.getByRole('button', { name: /Valider et mettre en ligne/ }), /[?&]ok=saved/);
const lieu = adm.p.url().match(/annonces\/([0-9a-f-]{36})/)[1];
await adm.p.locator('input[name=confirm]').last().check();
await adm.p.getByRole('button', { name: 'Supprimer' }).last().click();
await adm.p.waitForURL(/\/admin\/annonces\?ok=deleted/);
ok(sql(`select count(*) from listings where id = '${lieu}'`) === '0', 'admin : fiche supprimée');

// hébergement : logement, tarif saisonnier, fermeture, iCal
const villa = sql(`select id from listings where slug = 'villa-bois-lezard'`);
await go(adm.p, `/fr/admin/annonces/${villa}`);
ok(await adm.p.locator('#logements .unit-box').count() >= 2, 'hébergement : logements existants + formulaire d\'ajout');
const box = adm.p.locator('#logements .unit-box').first();
await box.locator('details').evaluateAll((ds) => ds.forEach((d) => { d.open = true; }));
const from = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10), to = new Date(Date.now() + 203 * 864e5).toISOString().slice(0, 10);
await box.locator('form', { hasText: 'Fermer ces dates' }).locator('input[name=from]').fill(from);
await box.locator('form', { hasText: 'Fermer ces dates' }).locator('input[name=to]').fill(to);
await act(adm.p, box.locator('form', { hasText: 'Fermer ces dates' }).getByRole('button', { name: 'Fermer ces dates' }), /[?&]ok=saved/);
ok(sql(`select count(*) from unit_blocks where lower(period) = '${from}'`) === '1', 'hébergement : période fermée enregistrée');
const ical = await adm.p.locator('code.copy').first().innerText();
const res = await adm.p.request.get(BASE + ical.slice(ical.indexOf('/api/')));
const body = await res.text();
ok(res.ok() && body.includes('BEGIN:VCALENDAR') && body.includes(from.replaceAll('-', '')), 'lien iCal exportable vers Airbnb/Booking, avec la fermeture');

// utilisateurs, catégories, destinations, contenus, réglages
await go(adm.p, '/fr/admin/utilisateurs?q=' + pro.email);
ok(await adm.p.locator('tbody tr').count() === 1 && await adm.p.locator('tbody tr', { hasText: TRADE }).count() === 1, 'admin : utilisateurs avec e-mail et nom commercial, recherche');
await adm.p.locator('tbody tr summary').click();
await act(adm.p, adm.p.getByRole('button', { name: 'Désactiver' }), /[?&]ok=saved/);
ok(sql(`select is_active from profiles where id = (select id from auth.users where email = '${pro.email}')`) === 'f', 'admin : compte désactivé');
await go(pro.p, '/fr/pro');
ok(pro.p.url().includes('/connexion'), 'un compte désactivé n\'accède plus à son espace');
sql(`update profiles set is_active = true where id = (select id from auth.users where email = '${pro.email}')`);

await go(adm.p, '/fr/admin/categories');
const cat = adm.p.locator('#c-lieu form', { hasText: 'Nouvelle sous-catégorie' });
await cat.locator('input[name=cname_fr]').fill('Expérience');
await act(adm.p, cat.getByRole('button', { name: 'Ajouter' }), /[?&]err=/);
ok((await notice(adm.p)).includes('Expérience'), 'catégories : « Expérience » refusée (cahier des charges § 5.D)');
await cat.locator('input[name=cname_fr]').fill('Cascade test');
await act(adm.p, cat.getByRole('button', { name: 'Ajouter' }), /[?&]ok=saved/);
ok(sql(`select count(*) from categories where name->>'fr' = 'Cascade test' and type = 'lieu'`) === '1', 'catégories : sous-catégorie ajoutée');
await act(adm.p, adm.p.locator('tr', { has: adm.p.locator('input[value="Cascade test"]') }).getByRole('button', { name: 'Supprimer' }), /[?&]ok=deleted/);
ok(sql(`select count(*) from categories where name->>'fr' = 'Cascade test'`) === '0', 'catégories : sous-catégorie inutilisée supprimée');

await go(adm.p, '/fr/admin/destinations');
const nd = adm.p.locator('form#nouvelle');
await nd.locator('input[name=dname_fr]').fill('Guadeloupe test');
await nd.locator('input[name=country_code]').fill('GP');
await nd.locator('input[name=timezone]').fill('America/Guadeloupe');
await nd.locator('input[name=lat]').fill('16.25'); await nd.locator('input[name=lng]').fill('-61.58');
await nd.locator('input[name=cover]').setInputFiles('/tmp/sd-photo.png');
await act(adm.p, nd.getByRole('button', { name: 'Enregistrer' }), /[?&]ok=saved/);
ok(sql(`select count(*) from destinations where slug = 'guadeloupe-test' and not is_active and cover_path is not null`) === '1', 'destinations : nouvelle destination ajoutée sans toucher au code (masquée tant qu\'elle n\'est pas prête)');
sql(`delete from destinations where slug = 'guadeloupe-test'`);

await go(adm.p, '/fr/admin/reglages');
await adm.p.fill('input[name=rate_excursion]', '15');
await act(adm.p, adm.p.getByRole('button', { name: 'Enregistrer' }), /[?&]ok=saved/);
ok(sql(`select rate from commission_rates where type = 'excursion' and provider_id is null order by valid_from desc limit 1`) === '0.1500', 'réglages : commission excursions passée à 15 %');
await adm.p.fill('input[name=rate_excursion]', '12');
await act(adm.p, adm.p.getByRole('button', { name: 'Enregistrer' }), /[?&]ok=saved/);

await go(adm.p, '/fr/admin/contenus');
const cgv = adm.p.locator('form#page-cgv');
await cgv.locator('input[name=title_fr]').fill('Conditions générales de vente');
await cgv.locator('textarea[name=body_fr]').fill('Article 1 — Objet (texte de test).\n\nArticle 2 — Prix.');
await act(adm.p, cgv.getByRole('button', { name: 'Enregistrer' }), /[?&]ok=saved/);
await go(adm.p, '/fr/informations/cgv');
ok(await adm.p.getByText('Article 2 — Prix.').count() === 1, 'contenus : page CGV modifiée depuis l\'administration');

await go(adm.p, '/fr/admin/ventes');
ok(await adm.p.locator('h2', { hasText: 'Reversements prestataires' }).count() === 1, 'réservations et paiements : commandes, réservations, reversements, remboursements');

// ---------- 3. Client : aucun accès aux espaces réservés
const cli = await newUser('client', 'Léa Cliente');
await go(cli.p, '/fr/pro');
ok(await cli.p.locator('h1', { hasText: 'Bienvenue dans votre espace professionnel' }).count() === 0, 'client : espace prestataire fermé');
await go(cli.p, '/fr/admin/utilisateurs');
ok(await cli.p.locator('table').count() === 0, 'client : administration fermée');

// ménage des données de test
sql(`delete from excursion_slots where listing_id = '${lid}'; delete from excursion_schedules where listing_id = '${lid}'; delete from listing_media where listing_id = '${lid}'; delete from listings where id = '${lid}'; delete from unit_blocks where lower(period) = '${from}'; delete from notifications where payload->>'listing' = '${lid}'`);
ok(errors.length === 0, `aucune erreur JavaScript${errors.length ? ' : ' + errors.join(' | ') : ''}`);
await b.close();
console.log(`\n${n - fail}/${n} vérifications réussies`);
process.exit(fail ? 1 : 0);
