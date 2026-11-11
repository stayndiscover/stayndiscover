import Link from 'next/link';
import { BackShell, statusPill } from '@/components/back/BackShell';
import { ListingTable } from '@/components/back/ListingTable';
import { requireAdmin, listListings, editorOptions, LISTING_STATUSES } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { tr } from '@/lib/i18n';

export const generateMetadata = backMeta('/admin/annonces', 'bo_listings');

/** Gestion des annonces (§ 5.C) : toutes les fiches, filtres, validation des annonces des prestataires. */
export default async function AdminListings(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const me = await requireAdmin(lang, `/${lang}/admin/annonces`);
  const [list, opts] = await Promise.all([listListings(me.id, sp), editorOptions(me.id, true)]);
  return (
    <BackShell lang={lang} area="admin" active="annonces" sp={sp}>
      <div className="row between"><h1 style={{ fontSize: '2rem' }}>{t('bo_listings')} <span className="muted small">({list.length})</span></h1>
        <Link className="btn" href={`/${lang}/admin/annonces/nouvelle`}>+ {t('bo_newListing')}</Link></div>
      <form className="row filters" method="get">
        <input type="search" name="q" defaultValue={sp.q ?? ''} placeholder={t('bo_search')} aria-label={t('bo_search')} style={{ maxWidth: 240 }} />
        <select name="type" defaultValue={sp.type ?? ''} aria-label={t('bo_type')}><option value="">{t('bo_type')} : {t('bo_all')}</option>
          <option value="hebergement">{t('k_stays')}</option><option value="excursion">{t('k_tours')}</option><option value="lieu">{t('k_places')}</option></select>
        <select name="dest" defaultValue={sp.dest ?? ''} aria-label={t('bo_dests')}><option value="">{t('bo_dests')} : {t('bo_all')}</option>
          {opts.dests.map((d) => <option key={d.id} value={d.slug}>{tr(d.name, lang)}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ''} aria-label={t('bo_state')}><option value="">{t('bo_state')} : {t('bo_all')}</option>
          {LISTING_STATUSES.map((s) => <option key={s} value={s}>{t(`st_${s}`)}</option>)}</select>
        <select name="provider" defaultValue={sp.provider ?? ''} aria-label={t('bo_provider')}><option value="">{t('bo_provider')} : {t('bo_all')}</option>
          {opts.providers.map((p) => <option key={p.id} value={p.id}>{p.trade_name}</option>)}</select>
        <button className="btn ghost sm">{t('bo_search')}</button>
      </form>
      <div className="chips">{LISTING_STATUSES.map((s) => (
        <Link key={s} href={`/${lang}/admin/annonces?status=${s}`} className={`pill ${statusPill(s)}`}>{t(`st_${s}`)}</Link>))}</div>
      <ListingTable lang={lang} list={list} base={`/${lang}/admin/annonces`} showProvider />
    </BackShell>
  );
}
