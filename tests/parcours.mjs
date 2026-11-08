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

// 3. Création d'un séjour → redirection vers les favoris
await go('/fr/sejour');
await p.selectOption('select[name=destination]', 'martinique');
await p.fill('input[name=start_date]', plus(40));
await p.fill('input[name=end_date]', plus(47));
await p.fill('input[name=arrival_time]', '14:30');
await p.fill('textarea[name=preferences]', 'Plages, nature');
await p.getByRole('button', { name: 'Créer mon séjour' }).click();
await p.waitForURL('**/favoris?sejour=*');
ok(await p.locator('.notice.ok').innerText().then((t) => t.includes('Séjour enregistré')), 'séjour enregistré, redirection vers les favoris');
ok(await p.locator('.cart-line').count() === 2, 'les 2 favoris non-hébergement de Martinique sont dans le séjour');
ok(await p.getByText('Autres destinations').count() === 1, 'le favori du Maroc reste à part');
await p.screenshot({ path: `${SHOTS}/favoris.png`, fullPage: true });

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
await p.locator('header button', { hasText: 'Déconnexion' }).click();
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

ok(errors.length === 0, 'aucune erreur JavaScript dans le navigateur' + (errors.length ? ' : ' + errors.join(' | ') : ''));
console.log(`\n${n - fail}/${n} vérifications réussies`);
await b.close();
process.exit(fail ? 1 : 0);
