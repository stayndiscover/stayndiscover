// Test du parcours voyageur dans un vrai navigateur (Chromium).
// Usage : BASE=http://localhost:3000 node tests/parcours.mjs  (avec la base locale + scripts/local-auth.mjs)
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || 'tests/screens';
const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
let n = 0, fail = 0;
const ok = (cond, label) => { n++; if (cond) console.log('OK  ', label); else { fail++; console.log('ÉCHEC', label); } };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const go = (u) => p.goto(BASE + u, { waitUntil: 'networkidle' });

// 1. Visiteur
await go('/');
ok(p.url().endsWith('/fr'), 'la racine redirige vers /fr');
ok(await p.locator('h1').first().innerText().then((t) => t.includes('Découvrez le monde')), 'accueil : titre de la bannière');
await p.getByRole('button', { name: 'Maroc' }).first().click();
await p.waitForTimeout(400);
ok(await p.locator('select[name=dest]').inputValue() === 'maroc', 'accueil : le diaporama se fige sur la destination choisie et la recherche suit');
await p.locator('.destcard', { hasText: 'Martinique' }).first().click();
await p.waitForURL('**/destinations/martinique');
ok(await p.locator('h2', { hasText: 'Hébergements' }).count() === 1, 'page destination Martinique');
await go('/fr/destinations/martinique/villa-bois-lezard');
await p.waitForSelector('.notice.ok');
ok(await p.locator('.notice.ok').innerText().then((t) => /€/.test(t)), 'fiche villa : devis calculé par la base pour un visiteur');
await p.locator('.pagehead button[aria-label="Ajouter aux favoris"]').click();
await p.waitForURL('**/connexion**');
ok(p.url().includes('next='), 'favori sans compte → page de connexion avec retour prévu');

// 2. Inscription
const email = `voyageur${Date.now()}@test.fr`;
await p.getByRole('tab', { name: 'Créer un compte' }).click();
await p.waitForSelector('input[name=full_name]');
await p.fill('input[name=full_name]', 'Léa Voyageuse');
await p.fill('input[name=email]', email);
await p.fill('input[name=password]', 'motdepasse123');
await p.getByRole('button', { name: 'Créer un compte' }).last().click();
await p.waitForURL('**/villa-bois-lezard');
ok(true, 'inscription puis retour sur la fiche');
await p.locator('.pagehead button[aria-label="Ajouter aux favoris"]').click();
await p.waitForSelector('.pagehead button[aria-pressed=true]');
ok(true, 'villa ajoutée aux favoris');
for (const u of ['/fr/destinations/martinique/dauphins-et-snorkeling-a-l-anse-noire', '/fr/destinations/martinique/plage-des-salines', '/fr/destinations/maroc/jardin-majorelle']) {
  await go(u);
  await p.locator('.pagehead button[aria-label="Ajouter aux favoris"]').click();
  await p.waitForSelector('.pagehead button[aria-pressed=true]');
}
ok(await p.locator('header .badge').first().innerText() === '4', 'compteur de favoris = 4');

// 3. Planificateur, phase 1 : questionnaire progressif (séjour fictif de test, 7 nuits en Martinique)
await go('/fr/sejour');
await p.getByRole('link', { name: /Créer un séjour/ }).first().click();
await p.waitForURL('**/sejour/nouveau');
const next = () => p.getByRole('button', { name: /Suivant/ }).click();
await next();
ok(await p.locator('.wizard .notice.bad').count() === 1, 'questionnaire : impossible de passer sans destination');
await p.locator('.wz-dest', { hasText: 'Martinique' }).click();
await p.fill('input[name=title]', 'Séjour fictif de test');
await next();
await p.fill('input[name=start_date]', plus(40)); await p.fill('input[name=end_date]', plus(47));
await p.fill('input[name=arrival_time]', '14:30');
ok(await p.locator('.wz-pane:not([hidden]) .notice.ok').innerText().then((x) => x.includes('7 nuit')), 'questionnaire : 7 nuits calculées automatiquement');
await next();
await p.getByLabel('Oui, réservé ailleurs').check();
await next();
ok(await p.locator('.wizard .notice.bad').count() === 1, 'questionnaire : nom et adresse exigés pour un hébergement réservé ailleurs');
await p.fill('input[name=ext_acc_name]', 'Gîte de test'); await p.fill('input[name=ext_acc_address]', 'Sainte-Anne, Martinique');
await p.fill('input[name=ext_gps]', 'pas des coordonnées');
await next();
ok(await p.locator('.wizard .notice.bad').innerText().then((x) => x.includes('GPS')), 'questionnaire : coordonnées GPS invalides refusées');
await p.fill('input[name=ext_gps]', '14.4432, -60.8857'); await p.fill('input[name=ext_check_in]', '15:00');
await next();
await p.fill('input[name=children]', '2');
await p.locator('select[name=child_age]').nth(1).selectOption('11');
ok(await p.locator('.wz-pane:not([hidden])').innerText().then((x) => x.includes('4 voyageur')), 'questionnaire : âges des enfants et total des voyageurs');
await next();
await p.locator('label.chip', { hasText: 'Plages et détente' }).click();
await p.locator('label.chip', { hasText: 'Plongée' }).click();
await next();
await p.locator('label.wz-pace', { hasText: 'Détente' }).click();
await p.fill('input[name=budget]', '2500');
await next();
ok(await p.locator('.wz-pane:not([hidden])').innerText().then((x) => x.includes('Gîte de test') && x.includes('Plongée')), 'questionnaire : récapitulatif complet');
await p.screenshot({ path: `${SHOTS}/questionnaire.png`, fullPage: true });
await p.getByRole('button', { name: 'Créer mon séjour' }).click();
await p.waitForURL(/\/fr\/sejour\/[0-9a-f-]{36}\?nouveau=1/);
const tripId = p.url().match(/sejour\/([0-9a-f-]{36})/)[1];
ok(await p.locator('.notice.ok').innerText().then((x) => x.includes('créé')), 'séjour créé et enregistré, redirection vers « Mon séjour »');
ok(await p.locator('#selection .cart-line').count() === 3, 'favoris du séjour : les 2 activités de Martinique + la villa mise en favori');
// tout se fait dans « Mon séjour » : catalogue complet et cœur en un clic (demande de Marion)
ok(await p.locator('#catalogue .card').count() >= 2, 'catalogue de la destination affiché sous les informations générales (filtré sur les envies)');
await p.locator('#catalogue a.chip', { hasText: 'Tout' }).click();
await p.waitForURL('**cat=tout**');
const nAll = await p.locator('#catalogue .card').count();
ok(nAll >= 13, `catalogue complet de la Martinique : ${nAll} fiches (hébergements, excursions, plages, restaurants…)`);
await p.locator('#catalogue a.chip', { hasText: 'Restaurant' }).click();
await p.waitForURL('**cat=restaurant**');
const resto = p.locator('#catalogue .card').first();
const restoName = await resto.locator('h3').innerText();
await resto.locator('button[aria-pressed=false]').click();
await p.waitForFunction((n) => [...document.querySelectorAll('#selection .cart-line')].some((x) => x.textContent.includes(n)), restoName);
ok(await p.locator('#catalogue .card').first().locator('button[aria-pressed=true]').count() === 1, `cœur : « ${restoName} » ajouté aux favoris du séjour en un clic`);
await p.locator('#catalogue .card').first().locator('button[aria-pressed=true]').click();
await p.waitForFunction((n) => ![...document.querySelectorAll('#selection .cart-line')].some((x) => x.textContent.includes(n)), restoName);
ok(true, 'cœur : second clic, retiré des favoris du séjour');
ok(await p.locator('ol.prog li').count() === 6, 'indicateur de progression en 6 étapes');
ok(await p.locator('#infos').innerText().then((x) => x.replace(/\s/g, ' ').includes('Gîte de test') && x.includes('11 ans') && x.replace(/\s/g, ' ').includes('2 500')), 'informations générales enregistrées (hébergement, âges, budget)');
ok(await p.locator('#planning').innerText().then((x) => x.includes('2/5')), 'essai gratuit : 2/5 activités');
await p.screenshot({ path: `${SHOTS}/mon-sejour.png`, fullPage: true });
await go(`/fr/favoris?sejour=${tripId}`);
ok(await p.getByText('Autres destinations').count() === 1, 'favoris : le favori du Maroc reste à part');

// 3 bis. 5 activités gratuites, puis 19,99 € au clic sur « Planifier mon voyage » (décision de Marion)
for (const slug of ['jardin-de-balata', 'anse-noire', 'grand-marche-de-fort-de-france']) {
  await go(`/fr/destinations/martinique/${slug}`);
  await p.getByRole('button', { name: /Ajouter à mon séjour/ }).click();
  await p.waitForSelector('.pagehead button:has-text("Dans mon séjour")');
}
ok(true, '3 activités de plus ajoutées gratuitement (5/5)');
await go('/fr/destinations/martinique/morne-larcher');
await p.getByRole('button', { name: /Ajouter à mon séjour/ }).click();
await p.waitForSelector('dialog.paywall[open]');
ok(await p.locator('dialog.paywall').innerText().then((x) => x.includes('19,99') && x.includes('sélection est conservée')), '6e activité : la fenêtre de déblocage à 19,99 € s\'affiche');
await p.getByRole('button', { name: 'Plus tard' }).click();
await p.waitForFunction(() => !document.querySelector('dialog.paywall'));
await go(`/fr/sejour/${tripId}`);
ok(await p.locator('#selection .cart-line').count() === 6, 'la sélection est conservée (5 activités + la villa)');
await p.locator('#planning').getByRole('button', { name: /Planifier mon voyage/ }).click();
await p.waitForSelector('dialog.paywall[open]');
ok(true, '« Planifier mon voyage » demande le paiement de 19,99 €');
await p.screenshot({ path: `${SHOTS}/paywall.png` });
await p.getByRole('button', { name: /Débloquer pour 19,99/ }).click();
await p.waitForSelector('dialog.paywall .notice.info');
ok(true, 'demande de déblocage enregistrée (en attendant Stripe)');
await p.keyboard.press('Escape');
await p.waitForFunction(() => !document.querySelector('dialog.paywall'));
const { execSync } = await import('node:child_process');
execSync(`psql -d stayndiscover -Atc "set role service_role; select public.mark_planner_unlock_paid(id) from public.planner_unlocks where trip_id = '${tripId}' and status = 'pending'"`);
await go(`/fr/sejour/${tripId}`);
await p.locator('#planning').getByRole('button', { name: /Planifier mon voyage/ }).click();
await p.waitForURL('**planning=bientot**');
ok(await p.locator('dialog.paywall').count() === 0 && await p.locator('.notice.info', { hasText: 'Planificateur débloqué' }).count() === 1, 'après paiement : pas de fenêtre, le planning est annoncé (phase 3)');
await go('/fr/destinations/martinique/morne-larcher');
await p.getByRole('button', { name: /Ajouter à mon séjour/ }).click();
await p.waitForSelector('.pagehead button:has-text("Dans mon séjour")');
ok(await p.locator('dialog.paywall').count() === 0, 'après paiement : 6e activité ajoutée sans fenêtre');

// 3 ter. Modifier, archiver et désarchiver le séjour
await go(`/fr/sejour/${tripId}/modifier`);
await p.locator('.wz-steps button', { hasText: 'Voyageurs' }).isDisabled();
for (let i = 0; i < 3; i++) await next();
await p.fill('input[name=adults]', '3');
for (let i = 0; i < 3; i++) await next();
await p.getByRole('button', { name: 'Enregistrer les modifications' }).click();
await p.waitForURL('**modifie=1');
ok(await p.locator('#infos').innerText().then((x) => x.includes('3 adulte')), 'modification du séjour enregistrée (3 adultes)');
await p.getByRole('button', { name: 'Archiver' }).click();
await p.waitForURL((u) => u.pathname === '/fr/sejour');
ok(await p.locator('details summary', { hasText: 'Séjours archivés (1)' }).count() === 1, 'séjour archivé, rangé à part');
await go(`/fr/sejour/${tripId}`);
await p.getByRole('button', { name: 'Désarchiver' }).click();
await p.waitForURL((u) => u.pathname === '/fr/sejour');
ok(await p.locator('details summary').count() === 0, 'séjour désarchivé');

// 4. Panier : séjour à la villa (dates libres puis dates bloquées)
await go('/fr/destinations/martinique/villa-bois-lezard');
await p.fill('input[name=start_date]', plus(21));
await p.fill('input[name=end_date]', plus(25));
await p.waitForSelector('.notice.bad');
ok(await p.locator('.notice.bad').innerText().then((t) => t.includes('déjà réservées')), 'dates bloquées refusées avant le panier');
ok(await p.getByRole('button', { name: 'Ajouter au panier' }).isDisabled(), 'bouton désactivé sur dates indisponibles');
await p.fill('input[name=start_date]', plus(40));
await p.fill('input[name=end_date]', plus(41));
await p.waitForFunction(() => document.querySelector('.notice.bad')?.textContent.includes('minimum'), null, { timeout: 5000 }).catch(() => {});
ok(await p.locator('.notice.bad').innerText().then((t) => t.includes('minimum')), 'séjour minimum de 3 nuits respecté');
await p.fill('input[name=end_date]', plus(44));
await p.waitForFunction(() => !!document.querySelector('.notice.ok') && !document.querySelector('form .notice.bad'));
await p.getByRole('button', { name: 'Ajouter au panier' }).click();
await p.waitForURL('**/panier');
ok(await p.locator('.cart-line').count() === 1, 'villa ajoutée au panier');
ok(await p.locator('.cart-line .num.price').first().innerText().then((t) => t.includes('1') && t.includes('€')), 'prix de la villa affiché');

// 5. Panier : excursion avec créneau et places
await go('/fr/destinations/martinique/dauphins-et-snorkeling-a-l-anse-noire');
await p.waitForSelector('.slots input[type=radio]');
const left = await p.locator('.slots label').first().innerText();
ok(/places restantes/.test(left), 'créneaux et places restantes affichés');
await p.fill('input[name=adults]', '2');
await p.fill('input[name=children]', '1');
await p.getByRole('button', { name: 'Ajouter au panier' }).click();
await p.waitForURL('**/panier');
ok(await p.locator('.cart-line').count() === 2, 'panier multi-prestations (villa + excursion)');
await p.screenshot({ path: `${SHOTS}/panier.png`, fullPage: true });

// 6. Langues
await p.selectOption('#lang', 'en');
await p.waitForURL('**/en/panier');
ok(await p.locator('h1').innerText() === 'My cart', 'changement de langue : EN');
await p.selectOption('#lang', 'es');
await p.waitForURL('**/es/panier');
ok(await p.locator('h1').innerText() === 'Mi carrito', 'changement de langue : ES');
await go('/fr/panier');

// 7. Retrait d'une ligne
await p.locator('.cart-line').nth(1).getByRole('button', { name: 'Retirer' }).click();
await p.waitForFunction(() => document.querySelectorAll('.cart-line').length === 1);
ok(true, 'retrait d\'une prestation du panier');

// 8. Profil
await go('/fr/compte');
await p.fill('input[name=phone]', '+596 696 12 34 56');
await p.getByRole('button', { name: 'Enregistrer' }).click();
await p.waitForSelector('.notice.ok');
ok(true, 'profil enregistré');

// 9. Déconnexion / reconnexion : les favoris sont conservés sur le compte
await go('/fr/compte');
await p.getByRole('button', { name: 'Déconnexion' }).click();
await p.waitForURL(/\/fr$/);
ok(await p.locator('header .badge').count() === 0, 'déconnectée : plus de favoris affichés');
const p2 = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' })).newPage(); // « autre appareil » (mobile)
await p2.goto(BASE + '/fr/connexion?next=/fr/favoris', { waitUntil: 'networkidle' });
await p2.fill('input[name=email]', email);
await p2.fill('input[name=password]', 'mauvais');
await p2.getByRole('button', { name: 'Se connecter' }).last().click();
await p2.waitForSelector('.notice.bad');
ok(true, 'mauvais mot de passe refusé');
ok(await p2.inputValue('input[name=email]') === email, 'l\'e-mail reste rempli après une erreur');
await p2.fill('input[name=password]', 'motdepasse123');
await p2.getByRole('button', { name: 'Se connecter' }).last().click();
await p2.waitForURL((u) => u.pathname === '/fr/favoris');
ok(await p2.locator('header .badge').first().innerText() === '4', 'favoris retrouvés sur un autre appareil (mobile)');
await p2.screenshot({ path: `${SHOTS}/mobile-favoris.png`, fullPage: false });
await p2.goto(BASE + '/fr', { waitUntil: 'networkidle' });
await p2.screenshot({ path: `${SHOTS}/mobile-accueil.png`, fullPage: false });

// 10. Recherche avec dates
await go(`/fr/explorer?dest=martinique&in=${plus(21)}&out=${plus(23)}&tr=2&type=hebergement`);
const villa = p.locator('.card', { hasText: 'Villa Bois-Lézard' });
ok(await villa.locator('.pill.bad').count() === 1, 'recherche avec dates : villa indisponible sur les nuits bloquées');
await go(`/fr/explorer?dest=martinique&in=${plus(60)}&out=${plus(63)}&tr=2&type=hebergement`);
ok(await p.locator('.card', { hasText: 'Villa Bois-Lézard' }).locator('.pill.ok').count() === 1, 'recherche avec dates : villa disponible ailleurs');
await go('/fr/explorer?q=plong');
ok(await p.locator('.card').count() >= 2, 'recherche texte « plong »');

// 10 bis. Proposition discrète du planificateur après 3 fiches (visiteur)
const pv = await (await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' })).newPage();
for (const slug of ['plage-des-salines', 'anse-noire', 'jardin-de-balata']) await pv.goto(`${BASE}/fr/destinations/martinique/${slug}`, { waitUntil: 'networkidle' });
await pv.waitForSelector('aside.nudge', { timeout: 5000 }).catch(() => {});
ok(await pv.locator('aside.nudge').count() === 1, 'proposition du planificateur après 3 fiches consultées');
await pv.getByRole('button', { name: 'Continuer ma recherche' }).click();
await pv.goto(`${BASE}/fr/destinations/martinique/morne-larcher`, { waitUntil: 'networkidle' }); await pv.waitForTimeout(2000);
ok(await pv.locator('aside.nudge').count() === 0, 'la proposition ne revient pas aussitôt (pas intrusive)');

// 11. Explorer : la liste se met à jour toute seule, sans bouton « Rechercher »
await go('/fr/explorer');
const total = await p.locator('.card').count();
await p.locator('form[role=search] select').first().selectOption('maroc');
await p.waitForURL('**/explorer?dest=maroc');
await p.waitForFunction(() => document.querySelector('.explorer-results')?.getAttribute('aria-busy') === 'false');
const dests = await p.locator('.card .body .row span:first-child').allInnerTexts();
ok(dests.length > 0 && dests.length < total && dests.every((d) => d === 'Maroc'), `Explorer : choisir « Maroc » n'affiche que le Maroc (${dests.length}/${total}), sans clic`);
await p.locator('form[role=search] input[type=search]').fill('riad');
await p.waitForURL('**q=riad**');
await p.waitForFunction(() => document.querySelector('.explorer-results')?.getAttribute('aria-busy') === 'false');
await p.waitForTimeout(800);
const nRiad = await p.locator('.card').count();
ok(nRiad >= 1 && nRiad < dests.length && await p.locator('.card', { hasText: 'Riad Dar Yasmine' }).count() === 1, `Explorer : la recherche texte se lance pendant la frappe (${nRiad} résultats)`);
await p.getByRole('button', { name: 'Effacer les filtres' }).click();
await p.waitForURL((u) => u.pathname === '/fr/explorer' && !u.search.includes('dest'));
ok(true, 'Explorer : « Effacer les filtres » revient à tout le catalogue');

ok(errors.length === 0, 'aucune erreur JavaScript dans le navigateur' + (errors.length ? ' : ' + errors.join(' | ') : ''));
console.log(`\n${n - fail}/${n} vérifications réussies`);
await b.close();
process.exit(fail ? 1 : 0);
