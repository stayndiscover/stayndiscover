import Link from 'next/link';
import { DestImg } from '@/components/DestImg';
import { getDestinations } from '@/lib/catalog';
import { countryLabel } from '@/lib/country';
import { isLang, translator, tr, type Lang } from '@/lib/i18n';

import { JsonLd } from '@/components/JsonLd';
import { abs, breadcrumb, pageMeta } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const names = (await getDestinations()).map((d) => tr(d.name, lang)).join(', ');
  return pageMeta({ lang, path: '/destinations', title: `${translator(lang)('navDest')}${lang === 'fr' ? ' : ' : ': '}${names}`, description: translator(lang)('seoDestsDesc') });
}

export default async function Destinations({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const dests = await getDestinations();
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <JsonLd data={{ '@graph': [
        breadcrumb([{ name: 'StayNdiscover', url: abs(lang) }, { name: t('navDest'), url: abs(lang, '/destinations') }]),
        { '@type': 'ItemList', itemListElement: dests.map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(lang, `/destinations/${d.slug}`), name: tr(d.name, lang) })) },
      ] }} />
      <div className="pagehead"><span className="eyebrow">{t('navDest')}</span><h1>{t('exploreDest')}</h1></div>
      <div className="grid g3">{dests.map((d) => (
        <Link key={d.slug} className="destcard" href={`/${lang}/destinations/${d.slug}`}>
          <div className="art"><DestImg d={d} lang={lang} /></div>
          <div className="txt"><span className="small">{countryLabel(d.country_code, lang)}</span><h3>{tr(d.name, lang)}</h3>
            <p className="small">{tr(d.description, lang)}</p></div>
        </Link>))}
      </div>
    </div>
  );
}
