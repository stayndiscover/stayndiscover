import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../globals.css';
import { Header, Footer } from '@/components/Chrome';
import { isLang, t } from '@/lib/i18n';
import { getDestinations } from '@/lib/catalog';
import { getUserState } from '@/lib/user-data';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = isLang(lang) ? lang : 'fr';
  return {
    title: { default: 'StayNdiscover', template: '%s · StayNdiscover' },
    description: t(l, 'heroSub'),
    icons: { icon: '/images/logo-symbole.png' },
    alternates: { languages: { fr: '/fr', en: '/en', es: '/es' } },
  };
}

export default async function LangLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const [{ me, favs, cartCount }, dests] = await Promise.all([getUserState(), getDestinations()]);
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <a className="skip" href="#contenu">{t(lang, 'skip')}</a>
        <Header lang={lang} me={me} favCount={favs.size} cartCount={cartCount} />
        <main id="contenu">{children}</main>
        <Footer lang={lang} dests={dests} />
      </body>
    </html>
  );
}
