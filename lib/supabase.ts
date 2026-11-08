import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const supabaseKey = () => (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

/** Client Supabase côté serveur : la session est gardée dans des cookies sécurisés. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(supabaseUrl(), supabaseKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // appelé depuis une page : le proxy rafraîchit déjà la session
        }
      },
    },
  });
}

/** URL publique d'un fichier du stockage Supabase (photos des annonces, couvertures). */
export const storageUrl = (bucket: string, path: string) =>
  `${supabaseUrl()}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
