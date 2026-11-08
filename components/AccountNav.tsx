import Link from 'next/link';
import { translator, type Lang } from '@/lib/i18n';
import { signOut } from '@/app/actions';

export function AccountNav({ lang, active }: { lang: Lang; active: 'compte' | 'favoris' | 'sejour' | 'panier' }) {
  const t = translator(lang);
  const items = [
    ['compte', t('account')], ['favoris', t('navFav')], ['sejour', t('myStays')], ['panier', t('navCart')],
  ] as const;
  return (
    <nav className="side-nav" aria-label={t('account')}>
      {items.map(([k, label]) => <Link key={k} href={`/${lang}/${k}`} className={active === k ? 'on' : ''} aria-current={active === k ? 'page' : undefined}>{label}</Link>)}
      <form action={signOut}>
        <input type="hidden" name="lang" value={lang} />
        <button className="side-logout">{t('logout')}</button>
      </form>
    </nav>
  );
}
