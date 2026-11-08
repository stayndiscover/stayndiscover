import 'server-only';
import { cache } from 'react';
import { getMe } from './auth';
import { withDb, rows } from './db';

/** Favoris et compteurs de la personne connectée (une requête par page). */
export const getUserState = cache(async () => {
  const me = await getMe();
  if (!me) return { me: null, favs: new Set<string>(), cartCount: 0 };
  const [favs, cart] = await withDb(me.id, async (db) => [
    await rows<{ listing_id: string }>(db, 'select listing_id from public.favorites where user_id = $1', [me.id]),
    await rows<{ n: number }>(db, 'select count(*)::int as n from public.cart_items where user_id = $1', [me.id]),
  ] as const);
  return { me, favs: new Set(favs.map((f) => f.listing_id)), cartCount: cart[0]?.n ?? 0 };
});
