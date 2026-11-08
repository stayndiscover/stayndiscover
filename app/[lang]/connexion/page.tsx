import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm, ResetForm, SignupForm } from '@/components/AuthForms';
import { getMe } from '@/lib/auth';
import { isLang, translator, type Lang } from '@/lib/i18n';

import { privateMeta } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  return privateMeta(lang, '/connexion', translator(lang)('login'));
}

export default async function Connexion({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith('/') && !sp.next.startsWith('//') ? sp.next : `/${lang}/compte`;
  if (await getMe()) redirect(next);
  const mode = sp.mode === 'signup' ? 'signup' : sp.mode === 'reset' ? 'reset' : 'login';
  const q = (m: string) => `/${lang}/connexion?mode=${m}&next=${encodeURIComponent(next)}${sp.type ? `&type=${sp.type}` : ''}`;
  const labels = { email: t('email'), password: t('password'), login: t('login'), signup: t('signup'), fullName: t('fullName'), pwdHint: t('pwdHint'),
    accountType: t('accountType'), accTraveller: t('accTraveller'), accProvider: t('accProvider'), send: t('sendLink') };
  return (
    <div className="wrap">
      <div className="auth-box panel">
        <div className="stack" style={{ gap: 6 }}><h1 style={{ fontSize: '1.8rem' }}>{t('needAccount')}</h1><p className="muted small">{t('needAccountText')}</p></div>
        {mode !== 'reset' && (
          <div className="seg" role="tablist">
            <Link role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} href={q('login')}>{t('login')}</Link>
            <Link role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} href={q('signup')}>{t('signup')}</Link>
          </div>
        )}
        {mode === 'login' && <><LoginForm lang={lang} next={next} l={labels} /><Link className="small" href={q('reset')}>{t('forgot')}</Link></>}
        {mode === 'signup' && <SignupForm lang={lang} next={next} l={labels} type={sp.type ?? ''} />}
        {mode === 'reset' && <><h2 style={{ fontSize: '1.2rem' }}>{t('forgot')}</h2><ResetForm lang={lang} l={labels} /><Link className="small" href={q('login')}>{t('login')}</Link></>}
      </div>
    </div>
  );
}
