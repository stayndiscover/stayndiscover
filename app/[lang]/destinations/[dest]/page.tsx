import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DestImg } from '@/components/DestImg';
import { Grid, listingHref } from '@/components/Card';
import { MapView } from '@/components/MapView';
import { getCategories, getDestinations, searchCards } from '@/lib/catalog';
import { countryLabel, destIn } from '@/lib/country';
import { destImgUrl } from '@/components/DestImg';
import { JsonLd } from '@/components/JsonLd';
import { abs, breadcrumb, clip, pageMeta, SITE_URL } from '@/lib/seo';
import { t } from '@/lib/i18n';
import { isLang, translator, tr, type Lang } from '@/lib/i18n';
import { getUserState } from '@/lib/user-data';

export async function generateMetadata({ params }: { params: Promise<{ lang: string; dest: string }> }) {
  const { lang: l, dest } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const d = (await getDestinations()).find((x) => x.slug === dest);
  if (!d) return {};
  const n = (await searchCards({ dest })).length;
  const name = tr(d.name, lang);
  return pageMeta({ lang, path: `/destinations/${dest}`, title: t(lang, 'seoDestTitle', name),
    description: clip(t(lang, 'seoDestDesc', destIn(dest, name, lang), n)), image: destImgUrl(d), imageAlt: name });
}

export default async function DestinationPage({ params }: { params: Promise<{ lang: string; dest: string }> }) {
  const { lang: l, dest } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const d = (await getDestinations()).find((x) => x.slug === dest);
  if (!d) notFound();
  const [items, cats, { favs }] = await Promise.all([searchCards({ dest }), getCategories(), getUserState()]);
  const path = `/${lang}/destinations/${dest}`;
  const by = (type: string) => items.filter((i) => i.type === type);
  const groups = cats.filter((c) => c.type === 'lieu').map((c) => [c, items.filter((i) => i.cat_slug === c.slug)] as const).filter(([, a]) => a.length);
  const img = destImgUrl(d);
  const ld = { '@graph': [
    breadcrumb([{ name: 'StayNdiscover', url: abs(lang) }, { name: tr(d.name, lang), url: abs(lang, `/destinations/${dest}`) }]),
    { '@type': 'TouristDestination', name: tr(d.name, lang), description: tr(d.description, lang), url: abs(lang, `/destinations/${dest}`),
      image: img ? (img.startsWith('http') ? img : SITE_URL + img) : undefined,
      geo: { '@type': 'GeoCoordinates', latitude: d.lat, longitude: d.lng },
      includesAttraction: items.filter((i) => i.type === 'lieu').slice(0, 20).map((i) => ({ '@type': 'TouristAttraction', name: tr(i.title, lang), url: abs(lang, `/destinations/${dest}/${i.slug}`) })) },
    { '@type': 'ItemList', itemListElement: items.slice(0, 50).map((i, k) => ({ '@type': 'ListItem', position: k + 1, url: abs(lang, `/destinations/${dest}/${i.slug}`), name: tr(i.title, lang) })) },
  ] };
  return (
    <>
      <JsonLd data={ld} />
      <section className="hero" style={{ minHeight: 300 }}>
        <div className="bgart"><DestImg d={d} eager lang={lang} sizes="100vw" /></div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(6,30,28,.8),rgba(6,30,28,.15))' }} />
        <div className="wrap">
          <span className="eyebrow" style={{ color: 'var(--sun)' }}>{countryLabel(d.country_code, lang)}</span>
          <h1>{tr(d.name, lang)}</h1>
          <p className="sub">{tr(d.description, lang)}</p>
          <div className="row">
            <Link className="btn sun" href={`/${lang}/sejour/nouveau?dest=${d.slug}`}>{t('planBtn')}</Link>
            <span className="small">{items.length} {t('listings')}</span>
          </div>
        </div>
      </section>
      <div className="wrap stack" style={{ gap: 36, padding: '40px 20px' }}>
        <div className="stack"><div className="row between"><h2>{t('navStay')}</h2><Link className="btn ghost sm" href={`/${lang}/explorer?type=hebergement&dest=${dest}`}>{t('seeAll')}</Link></div>
          {by('hebergement').length ? <Grid cards={by('hebergement')} lang={lang} favs={favs} path={path} /> : <p className="muted">{t('none')}</p>}</div>
        <div className="stack"><div className="row between"><h2>{t('navExc')}</h2><Link className="btn ghost sm" href={`/${lang}/explorer?type=excursion&dest=${dest}`}>{t('seeAll')}</Link></div>
          {by('excursion').length ? <Grid cards={by('excursion')} lang={lang} favs={favs} path={path} /> : <p className="muted">{t('none')}</p>}</div>
        {groups.map(([c, arr]) => (
          <div key={c.slug} className="stack"><h2>{tr(c.name, lang)}</h2><Grid cards={arr} lang={lang} favs={favs} path={path} /></div>
        ))}
        {items.some((i) => i.lat != null) && (
          <div className="stack"><h2>{t('mapTitle')}</h2>
            <MapView label={t('mapTitle')} points={items.filter((i) => i.lat != null).map((i, n) => ({ lat: i.lat!, lng: i.lng!, label: String(n + 1), title: tr(i.title, lang), href: listingHref(lang, i) }))} />
          </div>
        )}
      </div>
    </>
  );
}
