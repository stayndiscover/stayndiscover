import Link from 'next/link';
import { BackShell, ActionForm, statusPill } from '@/components/back/BackShell';
import { ProviderForm } from '@/components/back/ProviderForm';
import { requireAdmin, type Provider } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, rows, one } from '@/lib/db';
import { tr, type I18n } from '@/lib/i18n';
import { setProviderStatus } from '@/app/back-actions';

export const generateMetadata = backMeta('/admin/prestataires', 'bo_providers');

/** Gestion des prestataires (§ 5.B) : validation des inscriptions professionnelles, suspension, fiche. */
export default async function AdminProviders(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const path = `/${lang}/admin/prestataires`;
  const me = await requireAdmin(lang, path);
  const { list, edit, dests } = await withDb(me.id, async (db) => ({
    list: await rows<{ id: string; trade_name: string; email: string | null; phone: string | null; status: string; dest: I18n | null; payout_method: string;
      n: number; owner: string | null; created_at: string }>(db,
      `select p.id, p.trade_name, p.email, p.phone, p.status::text as status, d.name as dest, p.payout_method::text as payout_method,
              (select count(*)::int from public.listings l where l.provider_id = p.id) as n, pr.full_name as owner, to_char(p.created_at, 'YYYY-MM-DD') as created_at
         from public.providers p left join public.destinations d on d.id = p.destination_id left join public.profiles pr on pr.id = p.owner_id
        ${sp.status ? `where p.status = $1::public.provider_status` : ''}
        order by case p.status when 'pending' then 0 else 1 end, p.created_at desc`, sp.status ? [sp.status] : []),
    edit: sp.edit && /^[0-9a-f-]{36}$/.test(sp.edit) ? await one<Provider>(db,
      `select id, trade_name, logo_path, email, phone, address, country_code, destination_id, description, legal_info, status::text as status,
              payout_method::text as payout_method, manual_payout_details, approved_at from public.providers where id = $1`, [sp.edit]) : null,
    dests: await rows<{ id: string; name: I18n }>(db, `select id, name from public.destinations order by sort_order`),
  }));
  return (
    <BackShell lang={lang} area="admin" active="prestataires" sp={sp}>
      <h1 style={{ fontSize: '2rem' }}>{t('bo_providers')} <span className="muted small">({list.length})</span></h1>
      <div className="chips">
        <Link href={path} className={`chip ${!sp.status ? 'on' : ''}`}>{t('bo_all')}</Link>
        {['pending', 'approved', 'suspended'].map((s) => <Link key={s} href={`${path}?status=${s}`} className={`chip ${sp.status === s ? 'on' : ''}`}>{t(`pst_${s}`)}</Link>)}
      </div>
      {edit && <ProviderForm lang={lang} path={`${path}?edit=${edit.id}`.split('?')[0]} p={edit} dests={dests} admin />}
      {list.length ? (
        <div className="tablewrap panel" style={{ padding: 0 }}><table className="back-table">
          <thead><tr><th>{t('pro_trade')}</th><th>{t('bo_email')}</th><th>{t('bo_dests')}</th><th>{t('bo_listings')}</th><th>{t('pro_payMethod')}</th><th>{t('bo_state')}</th><th>{t('bo_actions')}</th></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.id}>
              <td><b>{p.trade_name}</b><br /><span className="small muted">{p.owner} · {p.created_at}</span></td>
              <td className="small">{p.email}<br />{p.phone}</td>
              <td className="small">{p.dest ? tr(p.dest, lang) : '—'}</td>
              <td className="small"><Link href={`/${lang}/admin/annonces?provider=${p.id}`}>{p.n} {t('prv_listingsN')}</Link></td>
              <td className="small">{t(`pm_${p.payout_method}`)}</td>
              <td><span className={`pill ${statusPill(p.status)}`}>{t(`pst_${p.status}`)}</span></td>
              <td><div className="row" style={{ gap: 6 }}>
                {p.status !== 'approved' && <ActionForm action={setProviderStatus} lang={lang} path={path} fields={{ provider: p.id, status: 'approved' }}><button className="btn sm">{t('prv_approve')}</button></ActionForm>}
                {p.status !== 'suspended' && <ActionForm action={setProviderStatus} lang={lang} path={path} fields={{ provider: p.id, status: 'suspended' }}><button className="btn ghost sm">{t('prv_suspend')}</button></ActionForm>}
                <Link className="btn ghost sm" href={`${path}?edit=${p.id}`}>{t('bo_edit')}</Link>
              </div></td>
            </tr>))}
          </tbody></table></div>
      ) : <p className="muted">{t('bo_none')}</p>}
    </BackShell>
  );
}
