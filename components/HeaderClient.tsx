'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { BurgerIcon } from './Icons';

type NavItem = { href: string; label: string };

export function MainNav({ items, menuLabel }: { items: NavItem[]; menuLabel: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav className={`main ${open ? 'open' : ''}`} aria-label={menuLabel}>
        {items.map((n) => (
          <Link key={n.href} href={n.href} className={path === n.href || (n.href.split('/').length > 2 && path.startsWith(n.href)) ? 'on' : ''}
            onClick={() => setOpen(false)}>{n.label}</Link>
        ))}
      </nav>
      <button type="button" className="iconbtn burger" aria-label={menuLabel} aria-expanded={open} onClick={() => setOpen(!open)}
        style={{ order: 10 }}><BurgerIcon /></button>
    </>
  );
}

/** Logo : ramène à l'accueil ; si on y est déjà, remonte en haut de la page. */
export function LogoLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <Link className="logo" href={href} aria-label="StayNdiscover · accueil" onClick={(e) => {
      if (path === href) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    }}>{children}</Link>
  );
}

export function LangSelect({ lang, label }: { lang: string; label: string }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <>
      <label className="sr-only" htmlFor="lang">{label}</label>
      <select id="lang" value={lang} onChange={(e) => {
        const parts = path.split('/'); parts[1] = e.target.value;
        router.push(parts.join('/') + window.location.search);
      }}>
        {['fr', 'en', 'es'].map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
      </select>
    </>
  );
}
