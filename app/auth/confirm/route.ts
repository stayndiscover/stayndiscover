import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase';

/** Lien reçu par e-mail (confirmation d'inscription, mot de passe oublié) : ouvre la session puis redirige. */
export async function GET(req: NextRequest) {
  const u = req.nextUrl;
  const raw = u.searchParams.get('next') || '/fr/compte';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/fr/compte';
  const sb = await supabaseServer();
  const code = u.searchParams.get('code');
  const tokenHash = u.searchParams.get('token_hash');
  const type = u.searchParams.get('type') as EmailOtpType | null;
  const { error } = code ? await sb.auth.exchangeCodeForSession(code)
    : tokenHash && type ? await sb.auth.verifyOtp({ token_hash: tokenHash, type }) : { error: new Error('lien incomplet') };
  const lang = next.split('/')[1] || 'fr';
  return NextResponse.redirect(new URL(error ? `/${lang}/connexion?mode=login` : next, u.origin));
}
