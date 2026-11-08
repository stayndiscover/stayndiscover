'use client';
import { useOptimistic, startTransition } from 'react';
import { toggleTripFavorite } from '@/app/actions';
import { HeartIcon } from './Icons';

/** Cœur de l'espace « Mon séjour » : ajoute ou retire l'élément des favoris de CE séjour, en un clic.
 *  Le cœur change tout de suite à l'écran (sans attendre le serveur), puis la page se met à jour. */
export function TripHeart({ lang, trip, listing, path, on, label }: { lang: string; trip: string; listing: string; path: string; on: boolean; label: string }) {
  const [shown, setShown] = useOptimistic(on);
  function act(f: FormData) {
    startTransition(async () => { setShown(!shown); await toggleTripFavorite(f); });
  }
  return (
    <form action={act} className="fav-form">
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="trip" value={trip} />
      <input type="hidden" name="listing" value={listing} /><input type="hidden" name="path" value={path} />
      <button type="submit" className="iconbtn" aria-pressed={shown} aria-label={label} title={label}><HeartIcon on={shown} /></button>
    </form>
  );
}
