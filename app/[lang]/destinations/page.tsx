import Link from 'next/link';
import { DestImg } from '@/components/DestImg';
import { getDestinations } from '@/lib/catalog';
import { countryLabel } from '@/lib/country';
import { isLang, translator, tr, type Lang } from '@/lib/i18n';

export const metadata = { title: 'Destinations' };

export default async function Destinations({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const dests = await getDestinations();
  return (
    <div className="wrap" style={{ paddingBottom: 40 }}>
      <div className="pagehead"><span className="eyebrow">{t('navDest')}</span><h1>{t('exploreDest')}</h1></div>
      <div className="grid g3">{dests.map((d) => (
        <Link key={d.slug} className="destcard" href={`/${lang}/destinations/${d.slug}`}>
          <div className="art"><DestImg d={d} /></div>
          <div className="txt"><span className="small">{countryLabel(d.country_code, lang)}</span><h3>{tr(d.name, lang)}</h3>
            <p className="small">{tr(d.description, lang)}</p></div>
        </Link>))}
      </div>
    </div>
  );
}
