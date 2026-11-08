import Link from 'next/link';
import { translator, tr, type Lang } from '@/lib/i18n';
import type { Me } from '@/lib/auth';
import type { Destination } from '@/lib/catalog';
import { CartIcon, HeartIcon, UserIcon } from './Icons';
import { LangSelect, MainNav } from './HeaderClient';
import { signOut } from '@/app/actions';

export function Header({ lang, me, favCount, cartCount }: { lang: Lang; me: Me | null; favCount: number; cartCount: number }) {
  const t = translator(lang);
  const p = `/${lang}`;
  const nav = [
    { href: `${p}/explorer`, label: t('navExplore') },
    { href: `${p}/destinations`, label: t('navDest') },
    { href: `${p}/explorer?type=hebergement`, label: t('navStay') },
    { href: `${p}/explorer?type=excursion`, label: t('navExc') },
    { href: `${p}/sejour`, label: t('navPlan') },
    me?.role === 'provider' ? { href: `${p}/compte`, label: t('navPro') }
      : me?.role === 'admin' ? { href: `${p}/compte`, label: t('navAdmin') } : { href: `${p}/compte`, label: t('navClient') },
  ];
  return (
    <header className="top">
      <div className="wrap">
        <Link className="logo" href={p} aria-label="StaynDiscover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-sym" src="/images/logo-symbole.png" alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-word" src="/images/logo-nom.png" alt="StaynDiscover" />
        </Link>
        <MainNav items={nav} menuLabel={t('menu')} />
        <div className="hdr-tools">
          <LangSelect lang={lang} label={t('lang')} />
          <Link className="iconbtn" href={`${p}/favoris`} aria-label={t('navFav')} title={t('navFav')}>
            <HeartIcon />{favCount > 0 && <span className="badge">{favCount}</span>}
          </Link>
          <Link className="iconbtn" href={`${p}/panier`} aria-label={t('navCart')} title={t('navCart')}>
            <CartIcon />{cartCount > 0 && <span className="badge">{cartCount}</span>}
          </Link>
          {me ? (
            <form action={signOut}>
              <input type="hidden" name="lang" value={lang} />
              <button className="btn sm acct ghost" aria-label={t('logout')}>
                <span className="acct-t">{(me.full_name || me.email).split(' ')[0]} · {t('logout')}</span><UserIcon />
              </button>
            </form>
          ) : (
            <Link className="btn sm acct" href={`${p}/connexion`} aria-label={t('login')}>
              <span className="acct-t">{t('login')}</span><UserIcon />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer({ lang, dests }: { lang: Lang; dests: Destination[] }) {
  const t = translator(lang);
  const p = `/${lang}`;
  return (
    <footer className="bottom">
      <div className="wrap">
        <div className="stack">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="logo-tile"><img src="/images/logo.png" alt="StaynDiscover" /></span>
          <p className="small">{t('footAbout')}</p>
          <p className="small"><a href="mailto:contact@stayndiscover.com" style={{ display: 'inline' }}>contact@stayndiscover.com</a></p>
        </div>
        <div><h4>{t('navDest')}</h4>{dests.map((d) => <Link key={d.slug} href={`${p}/destinations/${d.slug}`}>{tr(d.name, lang)}</Link>)}</div>
        <div><h4>{t('footPlatform')}</h4>
          <Link href={`${p}/explorer?type=hebergement`}>{t('navStay')}</Link>
          <Link href={`${p}/explorer?type=excursion`}>{t('navExc')}</Link>
          <Link href={`${p}/sejour`}>{t('navPlan')}</Link>
          <Link href={`${p}/connexion?mode=signup&type=provider`}>{t('navPro')}</Link>
        </div>
        <div><h4>{t('footLegal')}</h4>
          <Link href={`${p}/informations/cgv`}>{t('cgv')}</Link>
          <Link href={`${p}/informations/mentions`}>{t('mentions')}</Link>
          <Link href={`${p}/informations/confidentialite`}>{t('privacy')}</Link>
          <span className="small">Instagram · Facebook · TikTok</span>
        </div>
      </div>
      <div className="wrap small" style={{ paddingBottom: 24, opacity: 0.7 }}>© {new Date().getFullYear()} StaynDiscover</div>
    </footer>
  );
}
