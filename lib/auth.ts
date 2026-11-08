import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase';
import { withDb, one } from './db';
import type { Lang } from './i18n';

export type Me = { id: string; email: string; role: 'client' | 'provider' | 'admin'; full_name: string | null;
  phone: string | null; preferred_lang: Lang; is_active: boolean };

/** Personne connectée (vérifiée auprès de Supabase Auth), ou null. Une seule vérification par page. */
export const getMe = cache(async (): Promise<Me | null> => {
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const p = await withDb(data.user.id, (db) =>
    one<Omit<Me, 'email'>>(db, 'select id, role, full_name, phone, preferred_lang, is_active from public.profiles where id = $1', [data.user.id]));
  if (!p || !p.is_active) return null;
  return { ...p, email: data.user.email ?? '' };
});

export async function requireMe(lang: Lang, next: string) {
  const me = await getMe();
  if (!me) redirect(`/${lang}/connexion?next=${encodeURIComponent(next)}`);
  return me;
}
