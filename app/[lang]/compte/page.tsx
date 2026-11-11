import { redirect } from 'next/navigation';
import { AccountNav } from '@/components/AccountNav';
import { ProfileForm } from '@/components/ProfileForm';
import { requireMe } from '@/lib/auth';
import { withDb, rows } from '@/lib/db';
import { fDate, isLang, money, translator, tr, type I18n, type Lang } from '@/lib/i18n';

import { privateMeta } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  return privateMeta(lang, '/compte', translator(lang)('account'));
}

const ORDER: Record<string, string> = { paid: 'paid', awaiting_payment: 'pendingPay', authorized: 'pendingPay', partially_refunded: 'refunded', refunded: 'refunded', cancelled: 'cancelled', failed: 'cancelled', expired: 'cancelled' };
const STATUS: Record<string, string> = { confirmed: 'confirmed', hold: 'pendingPay', cancelled: 'cancelled', refunded: 'refunded', expired: 'cancelled', failed: 'cancelled' };

export default async function Compte({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const me = await requireMe(lang, `/${lang}/compte`);
  // chaque rôle a son propre espace : l'administration pour l'admin, l'espace pro pour le prestataire
  if (me.role === 'admin') redirect(`/${lang}/admin`);
  if (me.role === 'provider') redirect(`/${lang}/pro`);
  const [bookings, orders] = await withDb(me.id, async (db) => [
    await rows<{ id: string; title: I18n; type: string; status: string; amount: string; first: string | null; last: string | null; slot: string | null; number: string }>(db,
      `select b.id, l.title, b.type, b.status, b.amount, o.number, to_char(lower(b.stay), 'YYYY-MM-DD') as first, to_char(upper(b.stay), 'YYYY-MM-DD') as last,
              to_char(s.starts_at at time zone dd.timezone, 'YYYY-MM-DD"T"HH24:MI') as slot
         from public.bookings b join public.listings l on l.id = b.listing_id join public.destinations dd on dd.id = l.destination_id join public.orders o on o.id = b.order_id
         left join public.excursion_slots s on s.id = b.slot_id
        where b.user_id = $1 and b.status <> 'expired' order by b.created_at desc`, [me.id]),
    await rows<{ number: string; status: string; total: string; created_at: string }>(db,
      `select number, status, total, to_char(created_at, 'YYYY-MM-DD') as created_at from public.orders where user_id = $1 order by created_at desc`, [me.id]),
  ] as const);

  return (
    <div className="wrap acct-layout">
      <AccountNav lang={lang} active="compte" />
      <div className="stack" style={{ gap: 24 }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">{t(`role_${me.role}`)}</span>
          <h1 style={{ fontSize: '2rem' }}>{t('hello')} {me.full_name?.split(' ')[0] ?? ''}</h1>
        </div>
        <ProfileForm lang={lang} me={me} l={{ myProfile: t('myProfile'), fullName: t('fullName'), email: t('email'), phone: t('phone'),
          prefLang: t('prefLang'), newPass: t('newPass'), pwdHint: t('pwdHint'), save: t('save') }} />
        <div className="panel stack">
          <h2 style={{ fontSize: '1.3rem' }}>{t('myBookings')}</h2>
          {bookings.length ? (
            <div className="tablewrap"><table><thead><tr><th>{t('ref')}</th><th>{t('element')}</th><th>{t('dates')}</th><th>{t('status')}</th><th>{t('amount')}</th></tr></thead>
              <tbody>{bookings.map((b) => (
                <tr key={b.id}><td>{b.number}</td><td>{tr(b.title, lang)}</td>
                  <td>{b.first ? `${fDate(b.first, lang)} → ${fDate(b.last!, lang)}` : b.slot ? `${fDate(b.slot, lang)} ${b.slot.slice(11)}` : ''}</td>
                  <td><span className={`pill ${b.status === 'confirmed' ? 'ok' : b.status === 'hold' ? 'warn' : 'grey'}`}>{t(STATUS[b.status] ?? b.status)}</span></td>
                  <td className="num">{money(b.amount, lang)}</td></tr>))}
              </tbody></table></div>
          ) : <p className="muted small">{t('noBookings')}</p>}
        </div>
        <div className="panel stack">
          <h2 style={{ fontSize: '1.3rem' }}>{t('myPayments')}</h2>
          {orders.length ? (
            <div className="tablewrap"><table><thead><tr><th>{t('ref')}</th><th>{t('date')}</th><th>{t('status')}</th><th>{t('amount')}</th></tr></thead>
              <tbody>{orders.map((o) => <tr key={o.number}><td>{o.number}</td><td>{fDate(o.created_at, lang)}</td><td>{t(ORDER[o.status] ?? o.status)}</td><td className="num">{money(o.total, lang)}</td></tr>)}</tbody></table></div>
          ) : <p className="muted small">{t('noBookings')}</p>}
        </div>
      </div>
    </div>
  );
}
