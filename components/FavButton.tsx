import { toggleFavorite } from '@/app/actions';
import { HeartIcon } from './Icons';

/** Cœur des favoris : fonctionne même sans JavaScript (simple formulaire envoyé au serveur). */
export function FavButton({ id, on, path, label, inline = false }: { id: string; on: boolean; path: string; label: string; inline?: boolean }) {
  return (
    <form action={toggleFavorite} className={inline ? 'inline' : 'fav-form'}>
      <input type="hidden" name="listing" value={id} />
      <input type="hidden" name="path" value={path} />
      <button className="iconbtn" aria-pressed={on} aria-label={label} title={label}><HeartIcon on={on} /></button>
    </form>
  );
}
