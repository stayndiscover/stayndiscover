import Link from 'next/link';
import { BackShell } from '@/components/back/BackShell';
import { requireAdmin } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, rows } from '@/lib/db';
import { tr, type I18n, type Lang } from '@/lib/i18n';
import { storageUrl } from '@/lib/supabase';
import { saveDestination } from '@/app/back-actions';

export const generateMetadata = backMeta('/admin/destinations', 'bo_dests');

type Dest = { id: string; slug: string; name: I18n; description: I18n; country_code: string; timezone: string; lat: number; lng: number;
  cover_path: string | null; is_active: boolean; sort_order: number; n: number };

function DestForm({ lang, path, d, t }: { lang: Lang; path: string; d: Dest | null; t: (k: string) => string }) {
  const nm = (d?.name ?? {}) as Record<string, string>, ds = (d?.description ?? {}) as Record<string, string>;
  return (
    <form action={saveDestination} className="panel stack" style={{ gap: 12 }} id={d ? `d-${d.slug}` : 'nouvelle'}>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={path} /><input type="hidden" name="dest" value={d?.id ?? ''} />
      <input type="hidden" name="anchor" value={d ? `d-${d.slug}` : 'nouvelle'} />
      <div className="row between"><h2 style={{ fontSize: '1.2rem' }}>{d ? tr(d.name, lang) : `+ ${t('dst_new')}`}</h2>
        {d && <span className="small muted">{d.n} {t('prv_listingsN')}{d.is_active && <> · <Link href={`/${lang}/destinations/${d.slug}`} target="_blank">{t('bo_view')} ↗</Link></>}</span>}</div>
      <div className="form">
        {(['fr', 'en', 'es'] as const).map((l) => <label key={l} className="f">{t('bo_name')} ({l.toUpperCase()})<input type="text" name={`dname_${l}`} defaultValue={nm[l] ?? ''} required={l === 'fr'} /></label>)}
        <label className="f">{t('ed_slug')}<input type="text" name="slug" defaultValue={d?.slug ?? ''} pattern="[a-z0-9-]*" /></label>
        <label className="f">{t('dst_country')}<input type="text" name="country_code" maxLength={2} defaultValue={d?.country_code ?? ''} required /></label>
        <label className="f">{t('dst_tz')}<input type="text" name="timezone" defaultValue={d?.timezone ?? ''} required /></label>
        <label className="f">{t('ed_lat')}<input type="text" inputMode="decimal" name="lat" defaultValue={d?.lat ?? ''} required /></label>
        <label className="f">{t('ed_lng')}<input type="text" inputMode="decimal" name="lng" defaultValue={d?.lng ?? ''} required /></label>
        <label className="f">{t('dst_order')}<input type="number" name="sort_order" defaultValue={d?.sort_order ?? 10} /></label>
        <label className="f">{t('dst_cover')}<input type="file" name="cover" accept="image/jpeg,image/png,image/webp" /></label>
        {d?.cover_path && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={storageUrl('listing-media', d.cover_path)} alt="" style={{ height: 70, borderRadius: 8, alignSelf: 'end' }} />)}
        <label className="row small" style={{ gap: 8, alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" name="is_active" defaultChecked={d?.is_active ?? false} /> {t('dst_visible')}</label>
      </div>
      {(['fr', 'en', 'es'] as const).map((l) => <label key={l} className="f">{t('ed_desc')} ({l.toUpperCase()})<textarea name={`ddesc_${l}`} rows={3} defaultValue={ds[l] ?? ''} /></label>)}
      <button className="btn sm" style={{ alignSelf: 'flex-start' }}>{t('bo_save')}</button>
    </form>
  );
}

/** Gestion des destinations (§ 5.E) : en ajouter sans toucher au code. */
export default async function AdminDests(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const path = `/${lang}/admin/destinations`;
  const me = await requireAdmin(lang, path);
  const list = await withDb(me.id, (db) => rows<Dest>(db, `select d.*, (select count(*)::int from public.listings l where l.destination_id = d.id) as n
    from public.destinations d order by sort_order, slug`));
  return (
    <BackShell lang={lang} area="admin" active="destinations" sp={sp}>
      <h1 style={{ fontSize: '2rem' }}>{t('bo_dests')}</h1>
      {list.map((d) => <DestForm key={d.id} lang={lang} path={path} d={d} t={t} />)}
      <DestForm lang={lang} path={path} d={null} t={t} />
    </BackShell>
  );
}
