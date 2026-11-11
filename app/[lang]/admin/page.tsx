import Link from 'next/link';
import { BackShell } from '@/components/back/BackShell';
import { requireAdmin } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, one, rows } from '@/lib/db';
import { money, tr, type I18n } from '@/lib/i18n';

export const generateMetadata = backMeta('/admin', 'bo_admin');

/** Tableau de bord général (cahier des charges § 5.A). */
export default async function AdminHome(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const me = await requireAdmin(lang, `/${lang}/admin`);
  const { k, todo } = await withDb(me.id, async (db) => ({
    k: (await one<Record<string, string>>(db, `select
        (select count(*) from public.profiles where role = 'client') as clients,
        (select count(*) from public.providers) as providers,
        (select count(*) from public.listings where type = 'hebergement' and status = 'published') as stays,
        (select count(*) from public.listings where type = 'excursion' and status = 'published') as tours,
        (select count(*) from public.listings where type = 'lieu' and status = 'published') as places,
        (select count(*) from public.bookings where status = 'confirmed') as bookings,
        (select coalesce(sum(total), 0) from public.orders where status in ('paid','partially_refunded')) as revenue,
        (select coalesce(sum(commission_total), 0) from public.orders where status in ('paid','partially_refunded')) as commission,
        (select count(*) from public.orders where status in ('awaiting_payment','authorized')) as pending_pay,
        (select count(*) from public.bookings where status = 'hold' or external_push_status = 'failed') as to_process,
        (select count(*) from public.profiles where created_at > now() - interval '30 days') as new_users,
        (select count(*) from public.listings where status = 'pending') as to_moderate,
        (select count(*) from public.providers where status = 'pending') as providers_pending,
        (select coalesce(sum(amount), 0) from public.payouts where status in ('pending','scheduled','failed')) as to_pay`))!,
    todo: await rows<{ id: string; title: I18n; provider: string | null; updated_at: string }>(db,
      `select l.id, l.title, p.trade_name as provider, to_char(l.updated_at, 'YYYY-MM-DD') as updated_at
         from public.listings l left join public.providers p on p.id = l.provider_id where l.status = 'pending' order by l.updated_at limit 8`),
  }));
  const tiles: [string, string, string?][] = [
    ['k_clients', k.clients, 'utilisateurs'], ['k_providers', k.providers, 'prestataires'], ['k_stays', k.stays, 'annonces?type=hebergement&status=published'],
    ['k_tours', k.tours, 'annonces?type=excursion&status=published'], ['k_places', k.places, 'annonces?type=lieu&status=published'],
    ['k_bookings', k.bookings, 'ventes'], ['k_revenue', money(k.revenue, lang), 'ventes'], ['k_commission', money(k.commission, lang), 'ventes'],
    ['k_pendingPay', k.pending_pay, 'ventes'], ['k_toProcess', k.to_process, 'ventes'], ['k_newUsers', k.new_users, 'utilisateurs'],
    ['k_toPay', money(k.to_pay, lang), 'ventes'],
  ];
  return (
    <BackShell lang={lang} area="admin" active="" sp={sp}>
      <div className="row between"><h1 style={{ fontSize: '2rem' }}>{t('bo_admin')}</h1>
        <Link className="btn" href={`/${lang}/admin/annonces/nouvelle`}>+ {t('bo_newListing')}</Link></div>
      {(Number(k.to_moderate) > 0 || Number(k.providers_pending) > 0) && (
        <div className="row" style={{ gap: 10 }}>
          {Number(k.to_moderate) > 0 && <Link className="btn sun sm" href={`/${lang}/admin/annonces?status=pending`}>{t('k_toModerate')} : {k.to_moderate}</Link>}
          {Number(k.providers_pending) > 0 && <Link className="btn sun sm" href={`/${lang}/admin/prestataires?status=pending`}>{t('k_providersPending')} : {k.providers_pending}</Link>}
        </div>
      )}
      <div className="kpis">
        {tiles.map(([key, v, href]) => (
          <Link key={key} className="kpi" href={`/${lang}/admin/${href}`}><span className="small muted">{t(key)}</span><b>{v}</b></Link>
        ))}
      </div>
      {Number(k.revenue) === 0 && <p className="small muted">{t('bo_noPayYet')}</p>}
      <section className="panel stack">
        <h2 style={{ fontSize: '1.2rem' }}>{t('bo_todo')} · {t('k_toModerate')}</h2>
        {todo.length ? (
          <ul className="plain">{todo.map((x) => (
            <li key={x.id} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <Link href={`/${lang}/admin/annonces/${x.id}`}><b>{tr(x.title, lang)}</b></Link>
              <span className="small muted">{x.provider ?? '—'} · {x.updated_at}</span>
            </li>))}
          </ul>
        ) : <p className="small muted">{t('bo_none')}</p>}
      </section>
    </BackShell>
  );
}
