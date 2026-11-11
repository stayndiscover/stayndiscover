import Link from 'next/link';
import { BackShell } from '@/components/back/BackShell';
import { requireProvider, myProvider } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, one, rows } from '@/lib/db';
import { fDate, money, tr, type I18n } from '@/lib/i18n';

export const generateMetadata = backMeta('/pro', 'bo_pro');

/** Tableau de bord prestataire (§ 4.C). */
export default async function ProHome(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const me = await requireProvider(lang, `/${lang}/pro`);
  const p = await myProvider(me);
  const d = p ? await withDb(me.id, async (db) => ({
    k: (await one<Record<string, string>>(db, `select
      (select count(*) from public.listings where provider_id = $1 and status = 'published') as live,
      (select count(*) from public.listings where provider_id = $1 and status in ('draft','pending','changes_requested')) as wip,
      (select count(*) from public.bookings where provider_id = $1 and status = 'confirmed' and coalesce(upper(stay), current_date + 1) >= current_date) as upcoming,
      (select coalesce(sum(provider_amount), 0) from public.bookings where provider_id = $1 and status = 'confirmed') as earned,
      (select coalesce(sum(amount), 0) from public.payouts where provider_id = $1 and status <> 'paid') as to_pay`, [p.id]))!,
    notes: await rows<{ kind: string; payload: { title?: I18n; note?: string }; created_at: string }>(db,
      `select kind, payload, to_char(created_at, 'YYYY-MM-DD') as created_at from public.notifications where user_id = $1 order by created_at desc limit 6`, [me.id]),
  })) : null;
  return (
    <BackShell lang={lang} area="pro" active="" sp={sp}>
      <h1 style={{ fontSize: '2rem' }}>{t('pro_welcome')}</h1>
      {!p && <div className="notice">{t('pro_needProfile')} <Link href={`/${lang}/pro/profil`}><b>{t('bo_proProfile')} →</b></Link></div>}
      {p?.status === 'pending' && <div className="notice info">{t('pro_pendingApproval')}</div>}
      {p?.status === 'suspended' && <div className="notice bad">{t('pro_suspended')}</div>}
      {d && (
        <>
          <div className="kpis">
            <Link className="kpi" href={`/${lang}/pro/annonces`}><span className="small muted">{t('st_published')}</span><b>{d.k.live}</b></Link>
            <Link className="kpi" href={`/${lang}/pro/annonces`}><span className="small muted">{t('st_pending')} / {t('st_draft')}</span><b>{d.k.wip}</b></Link>
            <Link className="kpi" href={`/${lang}/pro/reservations`}><span className="small muted">{t('pro_newBookings')}</span><b>{d.k.upcoming}</b></Link>
            <Link className="kpi" href={`/${lang}/pro/finances`}><span className="small muted">{t('pro_revenue')}</span><b>{money(d.k.earned, lang)}</b></Link>
            <Link className="kpi" href={`/${lang}/pro/finances`}><span className="small muted">{t('pro_toPay')}</span><b>{money(d.k.to_pay, lang)}</b></Link>
          </div>
          <div className="row"><Link className="btn" href={`/${lang}/pro/annonces/nouvelle`}>+ {t('bo_newListing')}</Link></div>
          {d.notes.length > 0 && (
            <section className="panel stack"><h2 style={{ fontSize: '1.2rem' }}>Notifications</h2>
              <ul className="plain small">{d.notes.map((n, i) => (
                <li key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="muted">{fDate(n.created_at, lang)}</span> · <b>{n.kind.startsWith('listing_') ? t(`st_${n.kind.slice(8)}`) : n.kind.startsWith('provider_') ? t(`pst_${n.kind.slice(9)}`) : n.kind}</b>
                  {n.payload?.title && <> · {tr(n.payload.title, lang)}</>}{n.payload?.note && <><br />{n.payload.note}</>}
                </li>))}</ul>
            </section>
          )}
        </>
      )}
    </BackShell>
  );
}
