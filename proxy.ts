import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const LANGS = ['fr', 'en', 'es'];

function pickLang(req: NextRequest) {
  const saved = req.cookies.get('lang')?.value;
  if (saved && LANGS.includes(saved)) return saved;
  const al = (req.headers.get('accept-language') || '').toLowerCase();
  for (const part of al.split(',')) {
    const code = part.trim().slice(0, 2);
    if (LANGS.includes(code)) return code;
  }
  return 'fr';
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split('/')[1];

  // 1. Toujours une langue dans l'adresse : /fr, /en, /es
  if (!LANGS.includes(first) && !pathname.startsWith('/auth/')) {
    const url = req.nextUrl.clone();
    url.pathname = `/${pickLang(req)}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }

  // 2. Rafraîchit la session Supabase (cookies) à chaque passage
  let res = NextResponse.next({ request: req });
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && key) {
    const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    });
    await sb.auth.getUser();
  }
  if (LANGS.includes(first) && req.cookies.get('lang')?.value !== first) {
    res.cookies.set('lang', first, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|images/|api/|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico|xml|txt|webmanifest)$).*)'],
};
