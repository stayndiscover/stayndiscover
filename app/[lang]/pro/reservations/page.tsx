import { BackShell, statusPill } from '@/components/back/BackShell';
import { requireProvider, myProvider } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, rows } from '@/lib/db';
import { fDate, money, tr, type I18n } from '@/lib/i18n';

export const generateMetadata = backMeta('/pro/reservations', 'bo_bookings');

/** Gestion des réservations du prestataire (§ 4.C.4) : nouvelles, confirmées, annulations, dates et participants. */
export default async function ProBookings(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const me = await requireProvider(lang, `/${lang}/pro/reservations`);
  const p = await myProvider(me);
  const list = p ? await withDb(me.id, (db) => rows<{ id: string; title: I18n; status: string; amount: string; provider_amount: string; first: string | null; last: string | null;
    slot: string | null; adults: number | null; children: number | null; created_at: string }>(db,
    `select b.id, l.title, b.status::text as status, b.amount::text, b.provider_amount::text, to_char(lower(b.stay), 'YYYY-MM-DD') as first,
            to_char(upper(b.stay), 'YYYY-MM-DD') as last, to_char(s.starts_at at time zone dd.timezone, 'YYYY-MM-DD"T"HH24:MI') as slot, b.adults, b.children,
            to_char(b.created_at, 'YYYY-MM-DD') as created_at
       from public.bookings b join public.listings l on l.id = b.listing_id join public.destinations dd on dd.id = l.destination_id left join public.excursion_slots s on s.id = b.slot_id
      where b.provider_id = $1 and b.status <> 'expired' order by b.created_at desc limit 200`, [p.id])) : [];
  const groups: [string, (s: string) => boolean][] = [['pro_newBookings', (s) => s === 'confirmed' || s === 'hold'], ['pro_cancellations', (s) => s === 'cancelled' || s === 'refunded' || s === 'failed']];
  return (
    <BackShell lang={lang} area="pro" active="reservations" sp={sp}>
      <h1 style={{ fontSize: '2rem' }}>{t('bo_bookings')}</h1>
      {groups.map(([key, f]) => {
        const g = list.filter((b) => f(b.status));
        return (
          <section key={key} className="panel stack"><h2 style={{ fontSize: '1.2rem' }}>{t(key)} ({g.length})</h2>
            {g.length ? <div className="tablewrap"><table className="back-table"><thead><tr><th>{t('element')}</th><th>{t('dates')}</th><th>{t('pro_participants')}</th><th>{t('bo_state')}</th><th>{t('amount')}</th><th>{t('pro_toPay')}</th></tr></thead>
              <tbody>{g.map((b) => <tr key={b.id}><td>{tr(b.title, lang)}<br /><span className="small muted">{fDate(b.created_at, lang)}</span></td>
                <td className="small">{b.first ? `${fDate(b.first, lang)} → ${fDate(b.last!, lang)}` : b.slot ? `${fDate(b.slot, lang)} ${b.slot.slice(11)}` : ''}</td>
                <td className="small">{b.adults ?? 0}{b.children ? ` + ${b.children}` : ''}</td>
                <td><span className={`pill ${statusPill(b.status)}`}>{t(b.status === 'confirmed' ? 'confirmed' : b.status === 'hold' ? 'pendingPay' : 'cancelled')}</span></td>
                <td className="num">{money(b.amount, lang)}</td><td className="num">{money(b.provider_amount, lang)}</td></tr>)}</tbody></table></div>
              : <p className="small muted">{t('bo_none')}</p>}
          </section>
        );
      })}
    </BackShell>
  );
}
