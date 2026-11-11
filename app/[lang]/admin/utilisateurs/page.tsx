import { BackShell, ActionForm } from '@/components/back/BackShell';
import { requireAdmin } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, rows } from '@/lib/db';
import { fDate } from '@/lib/i18n';
import { setUser, deleteUser } from '@/app/back-actions';

export const generateMetadata = backMeta('/admin/utilisateurs', 'bo_users');

/** Gestion des utilisateurs (§ 5.B) : voir, changer le rôle, désactiver, supprimer selon les règles. */
export default async function AdminUsers(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const path = `/${lang}/admin/utilisateurs`;
  const me = await requireAdmin(lang, path);
  const all = await withDb(me.id, (db) => rows<{ id: string; email: string; role: string; full_name: string | null; phone: string | null; is_active: boolean;
    created_at: string; last_sign_in_at: string | null; provider_name: string | null }>(db,
    `select id, email, role::text as role, full_name, phone, is_active, to_char(created_at, 'YYYY-MM-DD') as created_at,
            to_char(last_sign_in_at, 'YYYY-MM-DD') as last_sign_in_at, provider_name from public.admin_users()`));
  const q = (sp.q ?? '').toLowerCase();
  const list = all.filter((u) => (!sp.role || u.role === sp.role) && (!q || `${u.email} ${u.full_name ?? ''} ${u.provider_name ?? ''}`.toLowerCase().includes(q)));
  return (
    <BackShell lang={lang} area="admin" active="utilisateurs" sp={sp}>
      <h1 style={{ fontSize: '2rem' }}>{t('bo_users')} <span className="muted small">({list.length})</span></h1>
      <form className="row filters" method="get">
        <input type="search" name="q" defaultValue={sp.q ?? ''} placeholder={t('bo_search')} aria-label={t('bo_search')} style={{ maxWidth: 260 }} />
        <select name="role" defaultValue={sp.role ?? ''} aria-label={t('bo_role')}><option value="">{t('bo_role')} : {t('bo_all')}</option>
          {['client', 'provider', 'admin'].map((r) => <option key={r} value={r}>{t(`role_${r}`)}</option>)}</select>
        <button className="btn ghost sm">{t('bo_search')}</button>
      </form>
      <div className="tablewrap panel" style={{ padding: 0 }}><table className="back-table">
        <thead><tr><th>{t('bo_name')}</th><th>{t('bo_email')}</th><th>{t('bo_role')}</th><th>{t('bo_signedUp')}</th><th>{t('bo_lastLogin')}</th><th>{t('bo_state')}</th><th>{t('bo_actions')}</th></tr></thead>
        <tbody>{list.map((u) => (
          <tr key={u.id} className={u.is_active ? '' : 'off'}>
            <td><b>{u.full_name ?? '—'}</b>{u.provider_name && <><br /><span className="small muted">{u.provider_name}</span></>}<br /><span className="small muted">{u.phone}</span></td>
            <td className="small">{u.email}</td>
            <td><span className="pill">{t(`role_${u.role}`)}</span></td>
            <td className="small">{fDate(u.created_at, lang)}</td>
            <td className="small">{u.last_sign_in_at ? fDate(u.last_sign_in_at, lang) : '—'}</td>
            <td><span className={`pill ${u.is_active ? 'ok' : 'bad'}`}>{u.is_active ? t('bo_active') : t('bo_inactive')}</span></td>
            <td>{u.id === me.id ? <span className="small muted">—</span> : (
              <details className="user-actions"><summary className="btn ghost sm">{t('bo_actions')}</summary>
                <div className="stack" style={{ gap: 6, paddingTop: 8 }}>
                  {(['client', 'provider', 'admin'] as const).filter((r) => r !== u.role).map((r) => (
                    <ActionForm key={r} action={setUser} lang={lang} path={path} fields={{ user: u.id, role: r }}>
                      <button className="btn ghost sm">{t(r === 'admin' ? 'usr_makeAdmin' : r === 'provider' ? 'usr_makeProvider' : 'usr_makeClient')}</button></ActionForm>))}
                  <ActionForm action={setUser} lang={lang} path={path} fields={{ user: u.id, active: u.is_active ? 'off' : 'on' }}>
                    <button className="btn ghost sm">{u.is_active ? t('bo_deactivate') : t('bo_activate')}</button></ActionForm>
                  <ActionForm action={deleteUser} lang={lang} path={path} fields={{ user: u.id }} confirm={t('bo_confirmDel')} className="stack">
                    <button className="btn danger sm">{t('bo_delete')}</button></ActionForm>
                </div>
              </details>)}</td>
          </tr>))}
        </tbody></table></div>
    </BackShell>
  );
}
