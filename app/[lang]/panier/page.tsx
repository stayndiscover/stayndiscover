import Link from 'next/link';
import { AccountNav } from '@/components/AccountNav';
import { Pic, listingHref } from '@/components/Card';
import { getMe } from '@/lib/auth';
import { withDb, rows } from '@/lib/db';
import { fDate, isLang, money, translator, tr, type I18n, type Lang } from '@/lib/i18n';
import { removeCartItem } from '@/app/actions';

export const metadata = { title: 'Panier' };

type Line = { id: string; listing_id: string; slug: string; dest_slug: string; cat_slug: string; title: I18n; type: string; provider: string | null;
  start_date: string | null; end_date: string | null; adults: number; children: number; local_time: string | null; local_date: string | null;
  quote: { nights: number; lodging: number; cleaning: number; total: number } | null; quote_error: string | null;
  price_adult: string | null; price_child: string | null; seats_left: number | null; free: boolean | null };

export default async function Panier({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const me = await getMe();
  if (!me) {
    return (
      <div className="wrap"><div className="empty-state panel" style={{ margin: '40px auto', maxWidth: 520 }}>
        <h1 style={{ fontSize: '1.6rem' }}>{t('cartTitle')}</h1><p className="muted">{t('needAccountText')}</p>
        <Link className="btn" href={`/${lang}/connexion?next=/${lang}/panier`}>{t('login')}</Link>
      </div></div>
    );
  }
  // Chaque ligne est revérifiée à l'affichage : prix calculé par la base, disponibilité et places en temps réel
  const lines = await withDb(me.id, async (db) => {
    const base = await rows<Omit<Line, 'quote' | 'quote_error'>>(db,
      `select c.id, c.listing_id, l.slug, d.slug as dest_slug, cat.slug as cat_slug, l.title, l.type,
              (select p.trade_name from public.provider_cards p where p.id = l.provider_id) as provider,
              to_char(c.start_date, 'YYYY-MM-DD') as start_date, to_char(c.end_date, 'YYYY-MM-DD') as end_date, c.adults, c.children,
              to_char(s.starts_at at time zone d.timezone, 'HH24:MI') as local_time, to_char(s.starts_at at time zone d.timezone, 'YYYY-MM-DD') as local_date,
              s.price_adult, s.price_child, public.slot_seats_left(s.id) as seats_left,
              case when c.unit_id is not null then not exists (select 1 from public.get_unit_busy_nights(c.unit_id, c.start_date, c.end_date)) end as free
         from public.cart_items c join public.listings l on l.id = c.listing_id join public.destinations d on d.id = l.destination_id
         join public.categories cat on cat.id = l.category_id left join public.excursion_slots s on s.id = c.slot_id
        where c.user_id = $1 order by coalesce(c.start_date, s.starts_at::date), c.created_at`, [me.id]);
    const out: Line[] = [];
    for (const b of base) {
      let quote = null, quote_error = null;
      if (b.type === 'hebergement') {
        await db.query('savepoint q');
        try {
          quote = (await rows<{ q: Line['quote'] }>(db, `select public.quote_stay(unit_id, start_date, end_date, adults + children) as q from public.cart_items where id = $1`, [b.id]))[0].q;
          await db.query('release savepoint q');
        } catch (e) { await db.query('rollback to savepoint q'); quote_error = e instanceof Error ? e.message : 'error'; }
      }
      out.push({ ...b, quote, quote_error });
    }
    return out;
  });

  const amount = (x: Line) => x.type === 'hebergement' ? Number(x.quote?.total ?? 0)
    : Number(x.price_adult ?? 0) * x.adults + Number(x.price_child ?? x.price_adult ?? 0) * x.children;
  const ok = (x: Line) => x.type === 'hebergement' ? !!x.free && !x.quote_error : (x.seats_left ?? 0) >= x.adults + x.children;
  const total = lines.reduce((s, x) => s + amount(x), 0);
  const providers = new Set(lines.map((x) => x.provider).filter(Boolean));

  return (
    <div className="wrap acct-layout">
      <AccountNav lang={lang} active="panier" />
      <div className="stack" style={{ gap: 24 }}>
        <h1 style={{ fontSize: '2rem' }}>{t('cartTitle')}</h1>
        {!lines.length ? (
          <div className="empty-state panel"><p className="muted">{t('cartEmpty')}</p><Link className="btn" href={`/${lang}/explorer`}>{t('navExplore')}</Link></div>
        ) : (
          <div className="layout2">
            <div className="stack">{lines.map((x) => (
              <div key={x.id} className="panel cart-line">
                <div className="thumb"><Pic c={{ id: x.listing_id, dest_slug: x.dest_slug, cat_slug: x.cat_slug, title: x.title }} /></div>
                <div className="stack" style={{ gap: 3 }}>
                  <Link href={listingHref(lang, x)} style={{ color: 'inherit', fontWeight: 700 }}>{tr(x.title, lang)}</Link>
                  {x.provider && <span className="small muted">{x.provider}</span>}
                  {x.type === 'hebergement' ? (
                    <span className="small">{fDate(x.start_date!, lang)} → {fDate(x.end_date!, lang)} · {x.quote?.nights ?? ''} {t('nightsS')} · {x.adults + x.children} {t('travelersS')}</span>
                  ) : (
                    <span className="small">{fDate(x.local_date!, lang)} · {x.local_time} · {x.adults} {t('adultsShort')}{x.children ? `, ${x.children} ${t('childrenShort')}` : ''}</span>
                  )}
                  {x.type === 'hebergement' && x.quote && Number(x.quote.cleaning) > 0 && (
                    <span className="small muted">{money(x.quote.lodging, lang)} + {t('cleaning').toLowerCase()} {money(x.quote.cleaning, lang)}</span>)}
                  <span><span className={`pill ${ok(x) ? 'ok' : 'bad'}`}>{ok(x) ? t('stillAvailable') : t('nothingAvailable')}</span></span>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
                  <b className="num price">{money(amount(x), lang)}</b>
                  <form action={removeCartItem}><input type="hidden" name="lang" value={lang} /><input type="hidden" name="item" value={x.id} />
                    <button className="btn ghost sm">{t('remove')}</button></form>
                </div>
              </div>))}
            </div>
            <aside className="panel stack sticky">
              <h2 style={{ fontSize: '1.2rem' }}>{t('summary')}</h2>
              <div className="row between small"><span>{lines.length} {t('services')} · {providers.size} {t('providers').toLowerCase()}</span></div>
              <div className="row between"><b>{t('total')}</b><b className="num price">{money(total, lang)}</b></div>
              <p className="small muted">{t('feesIncl')} {t('recheck')}</p>
              <button className="btn sun" disabled aria-describedby="pay-note">{t('payNow')}</button>
              <p className="small notice" id="pay-note">{t('payNotYet')}</p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
