import Link from 'next/link';
import { translator, tr, type Lang } from '@/lib/i18n';
import { storageUrl } from '@/lib/supabase';
import type { ListingRow } from '@/lib/back';
import { statusPill } from './BackShell';

export function ListingTable({ lang, list, base, showProvider }: { lang: Lang; list: ListingRow[]; base: string; showProvider?: boolean }) {
  const t = translator(lang);
  if (!list.length) return <p className="muted">{t('bo_none')}</p>;
  const typeKey = (ty: string) => (ty === 'hebergement' ? 'k_stays' : ty === 'excursion' ? 'k_tours' : 'k_places');
  return (
    <div className="tablewrap panel" style={{ padding: 0 }}>
      <table className="back-table">
        <thead><tr><th /><th>{t('ed_title')}</th><th>{t('bo_type')}</th><th>{t('bo_dests')}</th>{showProvider && <th>{t('bo_provider')}</th>}<th>{t('bo_state')}</th><th>{t('bo_photos')}</th><th>{t('bo_updated')}</th></tr></thead>
        <tbody>{list.map((l) => (
          <tr key={l.id}>
            <td className="thumb">{l.cover
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={storageUrl('listing-media', l.cover)} alt="" loading="lazy" /> : <span />}</td>
            <td><Link href={`${base}/${l.id}`}><b>{tr(l.title, lang)}</b></Link><br /><span className="small muted">{tr(l.cat_name, lang)}</span></td>
            <td className="small">{t(typeKey(l.type))}</td>
            <td className="small">{tr(l.dest_name, lang)}</td>
            {showProvider && <td className="small">{l.provider ?? '—'}</td>}
            <td><span className={`pill ${statusPill(l.status)}`}>{t(`st_${l.status}`)}</span></td>
            <td className="small num">{l.photos}</td>
            <td className="small muted">{l.updated_at}</td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}
