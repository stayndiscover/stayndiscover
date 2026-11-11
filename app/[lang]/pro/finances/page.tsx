import { BackShell, statusPill } from '@/components/back/BackShell';
import { requireProvider, myProvider } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, one, rows } from '@/lib/db';
import { fDate, money } from '@/lib/i18n';

export const generateMetadata = backMeta('/pro/finances', 'bo_finance');

/** Gestion financière du prestataire (§ 4.C.5). */
export default async function ProFinance(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const me = await requireProvider(lang, `/${lang}/pro/finances`);
  const p = await myProvider(me);
  const d = p ? await withDb(me.id, async (db) => ({
    k: (await one<Record<string, string>>(db, `select coalesce(sum(amount), 0) as revenue, coalesce(sum(commission_amount), 0) as commission,
        coalesce(sum(provider_amount), 0) as net from public.bookings where provider_id = $1 and status in ('confirmed','refunded')`, [p.id]))!,
    paid: (await one<{ v: string }>(db, `select coalesce(sum(amount), 0)::text as v from public.payouts where provider_id = $1 and status = 'paid'`, [p.id]))!.v,
    todo: (await one<{ v: string }>(db, `select coalesce(sum(amount), 0)::text as v from public.payouts where provider_id = $1 and status <> 'paid'`, [p.id]))!.v,
    payouts: await rows<{ id: string; amount: string; method: string; status: string; scheduled_for: string | null; paid_at: string | null; manual_reference: string | null }>(db,
      `select id, amount::text, method::text as method, status::text as status, to_char(scheduled_for, 'YYYY-MM-DD') as scheduled_for,
              to_char(paid_at, 'YYYY-MM-DD') as paid_at, manual_reference from public.payouts where provider_id = $1 order by created_at desc limit 100`, [p.id]),
  })) : null;
  return (
    <BackShell lang={lang} area="pro" active="finances" sp={sp}>
      <h1 style={{ fontSize: '2rem' }}>{t('bo_finance')}</h1>
      {d && (
        <>
          <div className="kpis">
            <div className="kpi"><span className="small muted">{t('pro_revenue')}</span><b>{money(d.k.revenue, lang)}</b></div>
            <div className="kpi"><span className="small muted">{t('pro_commission')}</span><b>{money(d.k.commission, lang)}</b></div>
            <div className="kpi"><span className="small muted">{t('pro_cashed')}</span><b>{money(d.paid, lang)}</b></div>
            <div className="kpi"><span className="small muted">{t('pro_toPay')}</span><b>{money(d.todo, lang)}</b></div>
          </div>
          <p className="small muted">{t('bo_noPayYet')}</p>
          <section className="panel stack"><h2 style={{ fontSize: '1.2rem' }}>{t('pro_payouts')}</h2>
            {d.payouts.length ? <div className="tablewrap"><table className="back-table"><thead><tr><th>{t('bo_date')}</th><th>{t('amount')}</th><th>{t('pro_payMethod')}</th><th>{t('bo_state')}</th><th>{t('prv_ref')}</th></tr></thead>
              <tbody>{d.payouts.map((y) => <tr key={y.id}><td className="small">{fDate(y.paid_at ?? y.scheduled_for ?? '', lang)}</td><td className="num">{money(y.amount, lang)}</td>
                <td className="small">{t(`pm_${y.method}`)}</td><td><span className={`pill ${statusPill(y.status)}`}>{y.status}</span></td><td className="small">{y.manual_reference}</td></tr>)}</tbody></table></div>
              : <p className="small muted">{t('bo_none')}</p>}
          </section>
        </>
      )}
    </BackShell>
  );
}
