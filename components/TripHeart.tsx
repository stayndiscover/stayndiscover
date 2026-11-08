import { toggleTripFavorite } from '@/app/actions';
import { HeartIcon } from './Icons';

/** Cœur de l'espace « Mon séjour » : ajoute ou retire l'élément des favoris de CE séjour, en un clic. */
export function TripHeart({ lang, trip, listing, path, on, label }: { lang: string; trip: string; listing: string; path: string; on: boolean; label: string }) {
  return (
    <form action={toggleTripFavorite} className="fav-form">
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="trip" value={trip} />
      <input type="hidden" name="listing" value={listing} /><input type="hidden" name="path" value={path} />
      <button className="iconbtn" aria-pressed={on} aria-label={label} title={label}><HeartIcon on={on} /></button>
    </form>
  );
}
