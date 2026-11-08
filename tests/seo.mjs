// Vérifie les balises de référencement de chaque type de page.
const BASE = process.env.BASE || 'http://localhost:3001';
const pages = ['/fr', '/en', '/es/destinations', '/fr/destinations/martinique', '/en/destinations/belize',
  '/fr/destinations/martinique/villa-bois-lezard', '/es/destinations/martinique/dauphins-et-snorkeling-a-l-anse-noire',
  '/fr/destinations/maroc/jardin-majorelle', '/fr/explorer?type=hebergement&dest=martinique', '/fr/explorer?q=plage', '/fr/informations/cgv',
  '/fr/connexion', '/fr/panier'];
let fail = 0;
for (const u of pages) {
  const h = await (await fetch(BASE + u, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } })).text();
  const get = (re) => (h.match(re) || [])[1];
  const title = get(/<title>([^<]*)<\/title>/);
  const desc = get(/<meta name="description" content="([^"]*)"/);
  const canon = get(/<link rel="canonical" href="([^"]*)"/);
  const robots = get(/<meta name="robots" content="([^"]*)"/);
  const hreflang = (h.match(/hrefLang="/g) || []).length;
  const og = get(/<meta property="og:image" content="([^"]*)"/);
  const h1 = (h.match(/<h1[\s>]/g) || []).length;
  const ld = [...h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { fail++; return 'JSON INVALIDE'; } });
  const types = ld.flatMap((x) => (x['@graph'] || [x]).map((g) => g['@type'])).join(',');
  const lang = get(/<html lang="([^"]*)"/);
  console.log(`\n${u}\n  lang=${lang} h1=${h1} | ${title} (${title?.length})\n  desc(${desc?.length}): ${desc}\n  canonical=${canon} robots=${robots} hreflang=${hreflang} og:image=${og ? 'oui' : 'NON'}\n  json-ld: ${types || '-'}`);
  if (!title || !desc || !canon || h1 !== 1 || (!robots?.startsWith('noindex') && (desc.length > 160 || hreflang < 4 || !og))) { fail++; console.log('  ⚠ manque'); }
}
console.log(fail ? `\n${fail} problème(s)` : '\nToutes les pages ont leurs balises.');
