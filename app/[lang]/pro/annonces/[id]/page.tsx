import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BackShell } from '@/components/back/BackShell';
import { ListingEditor } from '@/components/back/ListingEditor';
import { requireProvider, myProvider, getListing, editorOptions } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { tr } from '@/lib/i18n';

export const generateMetadata = backMeta('/pro/annonces', 'bo_myListings');

export default async function ProListing(props: PageProps) {
  const { lang, id, sp, t } = await pageArgs(props);
  const path = `/${lang}/pro/annonces/${id}`;
  const me = await requireProvider(lang, path);
  const p = await myProvider(me);
  if (!p) redirect(`/${lang}/pro/profil`);
  const isNew = id === 'nouvelle';
  const [l, opts] = await Promise.all([isNew ? null : getListing(me.id, id!), editorOptions(me.id, false)]);
  if (!isNew && (!l || l.provider_id !== p.id)) notFound();
  return (
    <BackShell lang={lang} area="pro" active="annonces" sp={sp}>
      <Link href={`/${lang}/pro/annonces`} className="small">{t('bo_back')}</Link>
      <h1 style={{ fontSize: '1.8rem' }}>{l ? tr(l.title, lang) : t('bo_newListing')}</h1>
      <ListingEditor lang={lang} area="pro" l={l} opts={opts} path={path} me={me} />
    </BackShell>
  );
}
