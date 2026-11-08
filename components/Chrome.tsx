import Link from 'next/link';
import { translator, tr, type Lang } from '@/lib/i18n';
import type { Me } from '@/lib/auth';
import type { Destination } from '@/lib/catalog';
import { CartIcon, HeartIcon, InstagramIcon, UserIcon } from './Icons';
import { INSTAGRAM_URL } from '@/lib/social';
import { LangSelect, MainNav } from './HeaderClient';

export function Header({ lang, me, favCount, cartCount }: { lang: Lang; me: Me | null; favCount: number; cartCount: number }) {
  const t = translator(lang);
  const p = `/${lang}`;
  // Barre volontairement légère : hébergements et excursions restent accessibles depuis « Explorer » et l'accueil,
  // l'espace client depuis l'icône de compte
  const nav = [
    { href: `${p}/destinations`, label: t('navDest') },
    { href: `${p}/explorer`, label: t('navExplore') },
    { href: `${p}/sejour`, label: t('navPlan') },
  ];
  return (
    <header className="top">
      <div className="wrap">
        <Link className="logo" href={p} aria-label="StayNdiscover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-sym" src="/images/logo-symbole.png" alt="" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-word" src="/images/logo-nom.png" alt="StayNdiscover" />
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
            <Link className="btn sm acct ghost" href={`${p}/compte`} aria-label={t('account')} title={t('account')}>
              <span className="acct-t">{(me.full_name || me.email).split(' ')[0]}</span><UserIcon />
            </Link>
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
          <span className="logo-tile"><img src="/images/logo.png" alt="StayNdiscover" /></span>
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
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label={t('followIg')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <InstagramIcon size={18} /> Instagram
          </a>
        </div>
      </div>
      <div className="wrap small" style={{ paddingBottom: 24, opacity: 0.7 }}>© {new Date().getFullYear()} StayNdiscover</div>
    </footer>
  );
}
