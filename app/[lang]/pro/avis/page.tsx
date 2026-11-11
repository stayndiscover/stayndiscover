import { BackShell, ActionForm } from '@/components/back/BackShell';
import { requireProvider, myProvider } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, rows } from '@/lib/db';
import { fDate, tr, type I18n } from '@/lib/i18n';
import { replyReview } from '@/app/back-actions';

export const generateMetadata = backMeta('/pro/avis', 'bo_reviews');

/** Avis clients (§ 4.C.6) : consulter et répondre. */
export default async function ProReviews(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const path = `/${lang}/pro/avis`;
  const me = await requireProvider(lang, path);
  const p = await myProvider(me);
  const list = p ? await withDb(me.id, (db) => rows<{ id: string; title: I18n; rating: number; body: string | null; provider_reply: string | null; created_at: string }>(db,
    `select r.id, l.title, r.rating, r.body, r.provider_reply, to_char(r.created_at, 'YYYY-MM-DD') as created_at
       from public.reviews r join public.listings l on l.id = r.listing_id where l.provider_id = $1 order by r.created_at desc limit 100`, [p.id])) : [];
  return (
    <BackShell lang={lang} area="pro" active="avis" sp={sp}>
      <h1 style={{ fontSize: '2rem' }}>{t('bo_reviews')}</h1>
      {list.length ? list.map((r) => (
        <article key={r.id} className="panel stack" style={{ gap: 8 }}>
          <div className="row between"><b>{tr(r.title, lang)}</b><span>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} <span className="small muted">{fDate(r.created_at, lang)}</span></span></div>
          {r.body && <p>{r.body}</p>}
          <ActionForm action={replyReview} lang={lang} path={path} fields={{ review: r.id }} className="stack">
            <label className="f">{t('pro_reply')}<textarea name="reply" rows={2} defaultValue={r.provider_reply ?? ''} /></label>
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }}>{t('pro_replyBtn')}</button>
          </ActionForm>
        </article>
      )) : <p className="muted">{t('bo_none')}</p>}
    </BackShell>
  );
}
