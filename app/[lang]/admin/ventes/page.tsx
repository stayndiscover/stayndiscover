import { BackShell, ActionForm, statusPill } from '@/components/back/BackShell';
import { requireAdmin } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, rows } from '@/lib/db';
import { fDate, money, tr, type I18n } from '@/lib/i18n';
import { markPayoutPaid } from '@/app/back-actions';

export const generateMetadata = backMeta('/admin/ventes', 'bo_sales');

/** Réservations et paiements (§ 5.F) : commandes, réservations, paiements, commissions, remboursements, reversements. */
export default async function AdminSales(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const path = `/${lang}/admin/ventes`;
  const me = await requireAdmin(lang, path);
  const d = await withDb(me.id, async (db) => ({
    orders: await rows<{ number: string; status: string; total: string; commission_total: string; created_at: string; customer: string | null }>(db,
      `select o.number, o.status::text as status, o.total::text, o.commission_total::text, to_char(o.created_at, 'YYYY-MM-DD') as created_at, p.full_name as customer
         from public.orders o left join public.profiles p on p.id = o.user_id order by o.created_at desc limit 100`),
    bookings: await rows<{ id: string; number: string; title: I18n; provider: string; status: string; amount: string; commission_amount: string;
      first: string | null; last: string | null; slot: string | null; adults: number | null; children: number | null }>(db,
      `select b.id, o.number, l.title, pr.trade_name as provider, b.status::text as status, b.amount::text, b.commission_amount::text,
              to_char(lower(b.stay), 'YYYY-MM-DD') as first, to_char(upper(b.stay), 'YYYY-MM-DD') as last, to_char(s.starts_at at time zone dd.timezone, 'YYYY-MM-DD"T"HH24:MI') as slot,
              b.adults, b.children
         from public.bookings b join public.orders o on o.id = b.order_id join public.listings l on l.id = b.listing_id join public.destinations dd on dd.id = l.destination_id join public.providers pr on pr.id = b.provider_id
         left join public.excursion_slots s on s.id = b.slot_id where b.status <> 'expired' order by b.created_at desc limit 150`),
    refunds: await rows<{ id: string; amount: string; status: string; created_at: string }>(db,
      `select id, amount::text, status::text as status, to_char(created_at, 'YYYY-MM-DD') as created_at from public.refunds order by created_at desc limit 50`),
    payouts: await rows<{ id: string; provider: string; amount: string; method: string; status: string; scheduled_for: string | null; manual_reference: string | null }>(db,
      `select y.id, pr.trade_name as provider, y.amount::text, y.method::text as method, y.status::text as status, to_char(y.scheduled_for, 'YYYY-MM-DD') as scheduled_for, y.manual_reference
         from public.payouts y join public.providers pr on pr.id = y.provider_id order by (y.status = 'paid'), y.scheduled_for nulls last limit 100`),
  }));
  const none = <p className="small muted">{t('bo_none')}</p>;
  return (
    <BackShell lang={lang} area="admin" active="ventes" sp={sp}>
      <h1 style={{ fontSize: '2rem' }}>{t('bo_sales')}</h1>
      <p className="small muted">{t('bo_noPayYet')}</p>
      <section className="panel stack"><h2 style={{ fontSize: '1.2rem' }}>{t('sal_orders')}</h2>
        {d.orders.length ? <div className="tablewrap"><table className="back-table"><thead><tr><th>{t('ref')}</th><th>{t('sal_customer')}</th><th>{t('bo_date')}</th><th>{t('bo_state')}</th><th>{t('sal_total')}</th><th>{t('pro_commission')}</th></tr></thead>
          <tbody>{d.orders.map((o) => <tr key={o.number}><td>{o.number}</td><td>{o.customer}</td><td className="small">{fDate(o.created_at, lang)}</td>
            <td><span className={`pill ${statusPill(o.status)}`}>{o.status}</span></td><td className="num">{money(o.total, lang)}</td><td className="num">{money(o.commission_total, lang)}</td></tr>)}</tbody></table></div> : none}
      </section>
      <section className="panel stack"><h2 style={{ fontSize: '1.2rem' }}>{t('bo_bookings')}</h2>
        {d.bookings.length ? <div className="tablewrap"><table className="back-table"><thead><tr><th>{t('ref')}</th><th>{t('element')}</th><th>{t('bo_provider')}</th><th>{t('dates')}</th><th>{t('pro_participants')}</th><th>{t('bo_state')}</th><th>{t('amount')}</th><th>{t('pro_commission')}</th></tr></thead>
          <tbody>{d.bookings.map((b) => <tr key={b.id}><td>{b.number}</td><td>{tr(b.title, lang)}</td><td className="small">{b.provider}</td>
            <td className="small">{b.first ? `${fDate(b.first, lang)} → ${fDate(b.last!, lang)}` : b.slot ? `${fDate(b.slot, lang)} ${b.slot.slice(11)}` : ''}</td>
            <td className="small">{(b.adults ?? 0) + (b.children ?? 0) || '—'}</td>
            <td><span className={`pill ${statusPill(b.status)}`}>{b.status}</span></td><td className="num">{money(b.amount, lang)}</td><td className="num">{money(b.commission_amount, lang)}</td></tr>)}</tbody></table></div> : none}
      </section>
      <section className="panel stack"><h2 style={{ fontSize: '1.2rem' }}>{t('sal_payouts')}</h2>
        {d.payouts.length ? <div className="tablewrap"><table className="back-table"><thead><tr><th>{t('bo_provider')}</th><th>{t('amount')}</th><th>{t('pro_payMethod')}</th><th>{t('bo_date')}</th><th>{t('bo_state')}</th><th /></tr></thead>
          <tbody>{d.payouts.map((y) => <tr key={y.id}><td>{y.provider}</td><td className="num">{money(y.amount, lang)}</td><td className="small">{t(`pm_${y.method}`)}</td>
            <td className="small">{y.scheduled_for ? fDate(y.scheduled_for, lang) : '—'}</td><td><span className={`pill ${statusPill(y.status)}`}>{y.status}</span> <span className="small muted">{y.manual_reference}</span></td>
            <td>{y.status !== 'paid' && y.method === 'manual_transfer' && (
              <ActionForm action={markPayoutPaid} lang={lang} path={path} fields={{ payout: y.id }} className="row">
                <input type="text" name="reference" placeholder={t('prv_ref')} aria-label={t('prv_ref')} style={{ maxWidth: 160 }} />
                <button className="btn sm">{t('prv_markPaid')}</button></ActionForm>)}</td></tr>)}</tbody></table></div> : none}
      </section>
      <section className="panel stack"><h2 style={{ fontSize: '1.2rem' }}>{t('sal_refunds')}</h2>
        {d.refunds.length ? <ul className="plain small">{d.refunds.map((r) => <li key={r.id}>{fDate(r.created_at, lang)} · {money(r.amount, lang)} · {r.status}</li>)}</ul> : none}
        <p className="small muted">{t('sal_disputes')}</p>
      </section>
    </BackShell>
  );
}
