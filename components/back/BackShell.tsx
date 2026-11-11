import Link from 'next/link';
import { translator, type Lang } from '@/lib/i18n';
import { signOut } from '@/app/actions';

type Area = 'admin' | 'pro';
const NAV: Record<Area, [string, string][]> = {
  admin: [['', 'bo_dash'], ['annonces', 'bo_listings'], ['prestataires', 'bo_providers'], ['utilisateurs', 'bo_users'], ['destinations', 'bo_dests'],
    ['categories', 'bo_cats'], ['ventes', 'bo_sales'], ['contenus', 'bo_content'], ['reglages', 'bo_settings'], ['profil', 'myProfile']],
  pro: [['', 'bo_dash'], ['profil', 'bo_proProfile'], ['annonces', 'bo_myListings'], ['reservations', 'bo_bookings'], ['finances', 'bo_finance'], ['avis', 'bo_reviews']],
};

/** Cadre commun des espaces prestataire et administration : menu latéral + messages de retour. */
export function BackShell({ lang, area, active, sp, children }: { lang: Lang; area: Area; active: string; sp?: { ok?: string; err?: string }; children: React.ReactNode }) {
  const t = translator(lang);
  const ok = sp?.ok?.startsWith('slots:') ? t('ed_slotsMade', sp.ok.slice(6)) : sp?.ok === 'submitted' ? t('pro_submitted') : sp?.ok === 'deleted' ? t('bo_deleted') : sp?.ok ? t('bo_saved') : null;
  return (
    <div className="wrap acct-layout back">
      <nav className="side-nav" aria-label={t(area === 'admin' ? 'bo_admin' : 'bo_pro')}>
        <span className="eyebrow" style={{ padding: '0 12px 6px' }}>{t(area === 'admin' ? 'bo_admin' : 'bo_pro')}</span>
        {NAV[area].map(([seg, key]) => {
          const href = `/${lang}/${area}${seg ? `/${seg}` : ''}`;
          return <Link key={seg} href={href} className={active === seg ? 'on' : ''} aria-current={active === seg ? 'page' : undefined}>{t(key)}</Link>;
        })}
        <form action={signOut}><input type="hidden" name="lang" value={lang} /><button className="side-logout">{t('logout')}</button></form>
      </nav>
      <div className="stack" style={{ gap: 22, minWidth: 0 }}>
        {ok && <div className="notice ok" role="status">{ok}</div>}
        {sp?.err && <div className="notice bad" role="alert">{sp.err}</div>}
        {children}
      </div>
    </div>
  );
}

/** Petit formulaire d'action (bouton) avec les champs cachés habituels. */
export function ActionForm({ action, lang, path, fields, anchor, children, className, confirm, id }: {
  action: (f: FormData) => Promise<void>; lang: string; path: string; fields?: Record<string, string>; anchor?: string;
  children: React.ReactNode; className?: string; confirm?: string; id?: string;
}) {
  return (
    <form action={action} className={className ?? 'inline-form'} id={id}>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={path} />
      {anchor && <input type="hidden" name="anchor" value={anchor} />}
      {Object.entries(fields ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {confirm && <label className="small muted row" style={{ gap: 6 }}><input type="checkbox" name="confirm" required /> {confirm}</label>}
      {children}
    </form>
  );
}

export const statusPill = (s: string) => (s === 'published' || s === 'approved' || s === 'paid' || s === 'confirmed' ? 'ok'
  : s === 'pending' || s === 'changes_requested' || s === 'scheduled' || s === 'hold' || s === 'awaiting_payment' ? 'warn'
  : s === 'refused' || s === 'suspended' || s === 'failed' || s === 'cancelled' ? 'bad' : 'grey');
