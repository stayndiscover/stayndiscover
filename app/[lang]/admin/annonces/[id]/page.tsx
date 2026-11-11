import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BackShell } from '@/components/back/BackShell';
import { ListingEditor } from '@/components/back/ListingEditor';
import { requireAdmin, getListing, editorOptions } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { tr } from '@/lib/i18n';

export const generateMetadata = backMeta('/admin/annonces', 'bo_listings');

export default async function AdminListing(props: PageProps) {
  const { lang, id, sp, t } = await pageArgs(props);
  const path = `/${lang}/admin/annonces/${id}`;
  const me = await requireAdmin(lang, path);
  const isNew = id === 'nouvelle';
  const [l, opts] = await Promise.all([isNew ? null : getListing(me.id, id!), editorOptions(me.id, true)]);
  if (!isNew && !l) notFound();
  return (
    <BackShell lang={lang} area="admin" active="annonces" sp={sp}>
      <Link href={`/${lang}/admin/annonces`} className="small">{t('bo_back')}</Link>
      <h1 style={{ fontSize: '1.8rem' }}>{l ? tr(l.title, lang) : t('bo_newListing')}</h1>
      <ListingEditor lang={lang} area="admin" l={l} opts={opts} path={path} me={me} />
    </BackShell>
  );
}
