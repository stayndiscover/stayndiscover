import Link from 'next/link';
import { BackShell } from '@/components/back/BackShell';
import { ListingTable } from '@/components/back/ListingTable';
import { requireProvider, myProvider, listListings } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';

export const generateMetadata = backMeta('/pro/annonces', 'bo_myListings');

export default async function ProListings(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const me = await requireProvider(lang, `/${lang}/pro/annonces`);
  const p = await myProvider(me);
  const list = p ? await listListings(me.id, { provider: p.id }) : [];
  return (
    <BackShell lang={lang} area="pro" active="annonces" sp={sp}>
      <div className="row between"><h1 style={{ fontSize: '2rem' }}>{t('bo_myListings')}</h1>
        {p && <Link className="btn" href={`/${lang}/pro/annonces/nouvelle`}>+ {t('bo_newListing')}</Link>}</div>
      {!p ? <p className="notice">{t('pro_needProfile')} <Link href={`/${lang}/pro/profil`}><b>{t('bo_proProfile')} →</b></Link></p>
        : <ListingTable lang={lang} list={list} base={`/${lang}/pro/annonces`} />}
    </BackShell>
  );
}
