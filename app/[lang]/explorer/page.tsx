import { Card } from '@/components/Card';
import { ExplorerShell } from '@/components/ExplorerFilters';
import { getCategories, getDestinations, searchCards } from '@/lib/catalog';
import { withDb, rows } from '@/lib/db';
import { fDate, isLang, translator, tr, type Lang } from '@/lib/i18n';
import { getUserState } from '@/lib/user-data';

import { JsonLd } from '@/components/JsonLd';
import { abs, breadcrumb, clip, pageMeta } from '@/lib/seo';
import { destIn } from '@/lib/country';
import { listingHref } from '@/components/Card';

/** Titre de la liste : « Hébergements en Martinique », « Plages au Maroc »… */
async function heading(lang: Lang, sp: SP) {
  const t = translator(lang);
  const [dests, cats] = await Promise.all([getDestinations(), getCategories()]);
  const type = ['hebergement', 'excursion', 'lieu'].includes(sp.type ?? '') ? sp.type! : '';
  const cat = cats.find((c) => c.slug === sp.sub);
  const d = dests.find((x) => x.slug === sp.dest);
  const what = cat ? tr(cat.name, lang) : type === 'hebergement' ? t('navStay') : type === 'excursion' ? t('navExc') : type === 'lieu' ? t('typeL') : t('exploreAll');
  return { what, d, type, title: d ? `${what} ${lang === 'fr' ? destIn(d.slug, tr(d.name, lang), lang) : t('inDest', tr(d.name, lang))}` : what };
}
/** Seuls type, destination et sous-catégorie font une page « officielle » ; recherche, prix et dates n'en sont que des filtres. */
const canonicalPath = (sp: SP) => {
  const u = new URLSearchParams(Object.entries({ type: sp.type, dest: sp.dest, sub: sp.sub }).filter(([, v]) => v) as [string, string][]);
  return `/explorer${u.size ? '?' + u : ''}`;
};

export async function generateMetadata({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<SP> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const sp = await searchParams;
  const h = await heading(lang, sp);
  const filtered = !!(sp.q || sp.max || sp.in || sp.out);
  const meta = pageMeta({ lang, path: canonicalPath(sp), title: h.title, description: clip(translator(lang)('seoListDesc', h.title)),
    noindex: filtered });
  return meta;
}
type SP = Record<string, string | undefined>;
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function Explorer({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<SP> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const sp = await searchParams;
  const type = ['hebergement', 'excursion', 'lieu'].includes(sp.type ?? '') ? sp.type! : '';
  const f = { dest: sp.dest || '', type, sub: sp.sub || '', q: sp.q || '', max: sp.max || '' };
  const [dests, cats, list, { favs }] = await Promise.all([getDestinations(), getCategories(), searchCards(f), getUserState()]);

  // Recherche avec dates : disponibilité réelle de chaque hébergement (calendrier + réservations + synchro iCal)
  const dated = isDate(sp.in) && isDate(sp.out) && sp.out! > sp.in!;
  const travellers = Math.max(1, Number(sp.tr) || 1);
  let avail = new Map<string, boolean>();
  let excAvail = new Map<string, number>();
  if (dated) {
    const ids = list.filter((c) => c.type === 'hebergement').map((c) => c.id);
    const exIds = list.filter((c) => c.type === 'excursion').map((c) => c.id);
    await withDb(null, async (db) => {
      if (ids.length) {
        const r = await rows<{ listing_id: string; ok: boolean }>(db, `select u.listing_id, bool_or(u.max_guests >= $4 and not exists (select 1 from public.get_unit_busy_nights(u.id, $2::date, $3::date))) as ok
          from public.accommodation_units u where u.listing_id = any($1::uuid[]) and u.is_active group by 1`, [ids, sp.in, sp.out, travellers]);
        avail = new Map(r.map((x) => [x.listing_id, x.ok]));
      }
      if (exIds.length) {
        const r = await rows<{ listing_id: string; n: number }>(db, `select s.listing_id, count(*)::int as n from public.excursion_slots s
          join public.listings l on l.id = s.listing_id join public.destinations d on d.id = l.destination_id
          where s.listing_id = any($1::uuid[]) and s.status = 'open' and s.starts_at > now() and s.capacity - s.seats_reserved >= $4
            and (s.starts_at at time zone d.timezone)::date >= $2::date and (s.starts_at at time zone d.timezone)::date < $3::date group by 1`,
          [exIds, sp.in, sp.out, travellers]);
        excAvail = new Map(r.map((x) => [x.listing_id, x.n]));
      }
    });
  }
  const isOn = (c: { id: string; type: string }) => c.type === 'hebergement' ? !!avail.get(c.id) : c.type === 'excursion' ? !!excAvail.get(c.id) : true;
  const qs = (patch: SP) => {
    const u = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/${lang}/explorer${u.size ? '?' + u : ''}`;
  };
  const path = qs({});
  const { title } = await heading(lang, sp);

  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <JsonLd data={{ '@graph': [
        breadcrumb([{ name: 'StayNdiscover', url: abs(lang) }, { name: t('navExplore'), url: abs(lang, '/explorer') }, { name: title, url: abs(lang, canonicalPath(sp)) }]),
        { '@type': 'ItemList', name: title, numberOfItems: list.length, itemListElement: list.slice(0, 50).map((c, k) => ({ '@type': 'ListItem', position: k + 1,
          url: abs(lang, listingHref(lang, c).slice(3)), name: tr(c.title, lang) })) },
      ] }} />
      <div className="pagehead"><span className="eyebrow">{t('navExplore')}</span><h1>{title}</h1>
        {dated && <p className="muted">{t('availFor', fDate(sp.in!, lang), fDate(sp.out!, lang), travellers)}</p>}</div>
      <ExplorerShell
        initial={{ q: f.q, dest: f.dest, type, sub: f.sub, max: f.max, in: dated ? sp.in! : '', out: dated ? sp.out! : '', tr: String(dated ? travellers : Number(sp.tr) || 2) }}
        dests={dests.map((d) => ({ value: d.slug, label: tr(d.name, lang) }))}
        cats={cats.map((c) => ({ slug: c.slug, type: c.type, label: tr(c.name, lang) }))}
        l={Object.fromEntries(['search', 'searchPh', 'destination', 'allDest', 'category', 'all', 'typeH', 'typeE', 'typeL', 'arrival', 'departure',
          'travelers', 'maxPrice', 'reset'].map((k) => [k, t(k)]))}>
        <p className="small muted" style={{ marginBottom: 12 }}>{list.length} {t('results')}</p>
        {list.length ? (
          <div className="grid g4">{(dated ? [...list].sort((x, y) => Number(isOn(y)) - Number(isOn(x))) : list).map((c) => {
            let extra: React.ReactNode = null;
            if (dated && c.type === 'hebergement') extra = <div><span className={`pill ${avail.get(c.id) ? 'ok' : 'bad'}`}>{avail.get(c.id) ? t('available') : t('unavailable')}</span></div>;
            if (dated && c.type === 'excursion') extra = <div><span className={`pill ${excAvail.get(c.id) ? 'ok' : 'bad'}`}>{excAvail.get(c.id) ? t('available') : t('unavailable')}</span></div>;
            return <Card key={c.id} c={c} lang={lang} fav={favs.has(c.id)} path={path} extra={extra} />;
          })}</div>
        ) : <p className="muted">{t('noResults')}</p>}
      </ExplorerShell>
    </div>
  );
}
