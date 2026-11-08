import Image from 'next/image';
import Link from 'next/link';
import { art, palFor } from '@/lib/art';
import type { Card as CardT } from '@/lib/catalog';
import { durL, money, translator, tr, type Lang } from '@/lib/i18n';
import { storageUrl } from '@/lib/supabase';
import { FavButton } from './FavButton';

export const listingHref = (lang: Lang, c: { dest_slug: string; slug: string }) => `/${lang}/destinations/${c.dest_slug}/${c.slug}`;

export function Pic({ c, k = '', eager = false, lang = 'fr' }: { c: { id: string; dest_slug: string; cat_slug: string; title: CardT['title']; cover?: string | null }; k?: string; eager?: boolean; lang?: Lang }) {
  if (c.cover && !k) {
    return <Image src={storageUrl('listing-media', c.cover)} alt={tr(c.title, lang)} fill sizes="(max-width: 820px) 100vw, 25vw" priority={eager} quality={70} />;
  }
  return <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: art(palFor(c.dest_slug), c.cat_slug, c.id + k) }} />;
}

export function Card({ c, lang, fav, path, extra }: { c: CardT; lang: Lang; fav: boolean; path: string; extra?: React.ReactNode }) {
  const t = translator(lang);
  const href = listingHref(lang, c);
  const title = tr(c.title, lang);
  return (
    <article className="card">
      <div className="pic">
        <Pic c={c} lang={lang} />
        <Link className="cover" href={href} aria-label={title} />
        <span className="tagtop pill grey">{tr(c.cat_name, lang)}</span>
        <FavButton id={c.id} on={fav} path={path} label={fav ? t('removeFav') : t('fav')} />
      </div>
      <div className="body">
        <div className="row small muted">
          <span>{tr(c.dest_name, lang)}</span>
          {c.rating_avg && <span>· ★ {Number(c.rating_avg).toFixed(1)}</span>}
          {c.booking_required && <span className="pill sun">{t('bookReq')}</span>}
        </div>
        <h3><Link href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{title}</Link></h3>
        <p className="small muted">{tr(c.summary, lang)}</p>
        {extra}
        <div className="foot">
          <span>
            {Number(c.price_from) > 0 ? (
              <>
                {c.type === 'hebergement' && <span className="small muted">{t('from')} </span>}
                <span className="price num">{money(c.price_from, lang, c.currency)}</span>{' '}
                <span className="small muted">{c.type === 'hebergement' ? t('perNight') : c.type === 'lieu' ? t('approx') : t('perPers')}</span>
              </>
            ) : c.type === 'lieu' ? <span className="pill ok">{t('free')}</span> : null}
          </span>
          <span className="small muted">{c.type === 'hebergement' ? (c.capacity ? t('capN', c.capacity) : '') : c.duration ? durL(c.duration) : ''}</span>
        </div>
      </div>
    </article>
  );
}

export function Grid({ cards, lang, favs, path, cls = 'g4' }: { cards: CardT[]; lang: Lang; favs: Set<string>; path: string; cls?: string }) {
  return <div className={`grid ${cls}`}>{cards.map((c) => <Card key={c.id} c={c} lang={lang} fav={favs.has(c.id)} path={path} />)}</div>;
}
