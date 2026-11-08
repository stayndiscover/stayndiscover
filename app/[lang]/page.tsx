import Link from 'next/link';
import { Hero } from '@/components/Hero';
import { DestImg, destImgUrl } from '@/components/DestImg';
import { Grid } from '@/components/Card';
import { Newsletter } from '@/components/Newsletter';
import { getCategories, getDestinations, homeReviews, providerNames, searchCards, siteContent } from '@/lib/catalog';
import { getUserState } from '@/lib/user-data';
import { isLang, translator, tr, type Lang } from '@/lib/i18n';
import { countryLabel } from '@/lib/country';

const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang: Lang = isLang(l) ? l : 'fr';
  const t = translator(lang);
  const p = `/${lang}`;
  const [dests, cats, { favs }, stays, excs, sights, restos, beaches, picks, partners, reviews, hero] = await Promise.all([
    getDestinations(), getCategories(), getUserState(),
    searchCards({ type: 'hebergement', limit: 4 }), searchCards({ type: 'excursion', limit: 4 }),
    searchCards({ sub: 'site-attraction', limit: 4 }), searchCards({ sub: 'restaurant', limit: 3 }), searchCards({ sub: 'plage', limit: 3 }),
    searchCards({ type: 'lieu', limit: 30 }), providerNames(), homeReviews(), siteContent('home.hero'),
  ]);
  const heart = picks.filter((c) => ['point-de-vue', 'randonnee', 'spot-photo', 'marche'].includes(c.cat_slug)).slice(0, 3);
  const heroText = hero?.value?.[lang] ?? {};
  const sub = (type: string) => cats.filter((c) => c.type === type);
  const section = (eyebrow: string, title: string, href: string | null, children: React.ReactNode, style?: React.CSSProperties) => (
    <section className="block" style={style}><div className="wrap stack" style={{ gap: 20 }}>
      <div className="row between"><div className="stack" style={{ gap: 4 }}><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
        {href && <Link className="btn ghost" href={href}>{t('seeAll')}</Link>}</div>
      {children}
    </div></section>
  );

  return (
    <>
      <Hero
        slides={dests.map((d) => ({ slug: d.slug, name: tr(d.name, lang), country: countryLabel(d.country_code, lang), img: destImgUrl(d) }))}
        action={`${p}/explorer`}
        defaults={{ in: addDays(30), out: addDays(37) }}
        labels={{
          eyebrowAll: dests.map((d) => tr(d.name, lang)).join(' · '), destination: t('destination'), allDest: t('allDest'),
          arrival: t('arrival'), departure: t('departure'), travelers: t('travelers'), searchType: t('searchType'), typeH: t('typeH'),
          typeE: t('typeE'), exploreBtn: t('exploreBtn'), title: heroText.title || t('heroTitle'), sub: heroText.subtitle || t('heroSub'), group: t('navDest'),
        }}
      />

      <section className="block"><div className="wrap stack" style={{ gap: 24 }}>
        <div className="stack" style={{ gap: 4 }}><span className="eyebrow">{t('navDest')}</span><h2>{t('exploreDest')}</h2></div>
        <div className="grid g3">{dests.map((d) => (
          <Link key={d.slug} className="destcard" href={`${p}/destinations/${d.slug}`}>
            <div className="art"><DestImg d={d} /></div>
            <div className="txt"><span className="small">{countryLabel(d.country_code, lang)}</span><h3>{tr(d.name, lang)}</h3>
              <p className="small">{tr(d.description, lang)}</p><span className="btn sun sm" style={{ alignSelf: 'flex-start' }}>{t('discover')}</span></div>
          </Link>))}
        </div>
      </div></section>

      <section><div className="wrap"><div className="plan-band">
        <div className="stack" style={{ gap: 16 }}>
          <span className="eyebrow" style={{ color: 'var(--sun)' }}>{t('navPlan')}</span><h2>{t('planTitle')}</h2>
          <p className="muted">{t('planText')}</p>
          <ol className="muted small" style={{ margin: 0, paddingLeft: 18 }}>{t('planSteps').split('|').map((x) => <li key={x}>{x}</li>)}</ol>
          <Link className="btn sun" href={`${p}/sejour`} style={{ alignSelf: 'flex-start' }}>{t('planBtn')}</Link>
        </div>
        <div className="mini-plan">
          <span className="small" style={{ color: '#b9c9c6' }}>{t('exampleDay')}</span>
          {[['09:00', 'Dauphins & snorkeling', t('booked')], ['13:30', 'Restaurant créole', '20 min'], ['15:30', 'Anse Noire', '10 min'], ['17:30', 'Morne Larcher', '25 min']].map(([h, n, s], k) => (
            <div className="it" key={h}><b>{h}</b><span>{n}</span>{k === 0 ? <span className="pill sun">{s}</span> : <span className="small" style={{ color: '#b9c9c6' }}>{s}</span>}</div>
          ))}
        </div>
      </div></div></section>

      {section(t('navStay'), t('stayTitle'), `${p}/explorer?type=hebergement`, <>
        <div className="chips">{sub('hebergement').map((c) => <Link key={c.slug} className="chip" href={`${p}/explorer?type=hebergement&sub=${c.slug}`}>{tr(c.name, lang)}</Link>)}</div>
        <Grid cards={stays} lang={lang} favs={favs} path={p} />
      </>)}

      {section(t('navExc'), t('excTitle'), `${p}/explorer?type=excursion`, <>
        <div className="chips">{sub('excursion').map((c) => <Link key={c.slug} className="chip" href={`${p}/explorer?type=excursion&sub=${c.slug}`}>{tr(c.name, lang)}</Link>)}</div>
        <Grid cards={excs} lang={lang} favs={favs} path={p} />
      </>, { paddingTop: 0 })}

      {section(t('mustSee'), t('mustSeeTitle'), `${p}/explorer?type=lieu`, <>
        <Grid cards={sights} lang={lang} favs={favs} path={p} />
        {restos.length > 0 && <><div className="row between"><h3>{t('restoTitle')}</h3><Link className="btn ghost sm" href={`${p}/explorer?type=lieu&sub=restaurant`}>{t('seeAll')}</Link></div>
          <Grid cards={restos} lang={lang} favs={favs} path={p} cls="g3" /></>}
        {beaches.length > 0 && <><div className="row between"><h3>{t('beachTitle')}</h3><Link className="btn ghost sm" href={`${p}/explorer?type=lieu&sub=plage`}>{t('seeAll')}</Link></div>
          <Grid cards={beaches} lang={lang} favs={favs} path={p} cls="g3" /></>}
      </>, { paddingTop: 0 })}

      <section className="block" style={{ background: 'var(--surface)', borderBlock: '1px solid var(--line)' }}><div className="wrap stack" style={{ gap: 24 }}>
        <div className="stack" style={{ gap: 4 }}><span className="eyebrow">{t('heartPicks')}</span><h2>{t('heartTitle')}</h2></div>
        <Grid cards={heart} lang={lang} favs={favs} path={p} cls="g3" />
        {partners.length > 0 && <><h3>{t('partners')}</h3>
          <div className="chips">{partners.map((x) => <span key={x.trade_name} className="pill grey" style={{ padding: '8px 14px' }}>{x.trade_name}</span>)}</div></>}
      </div></section>

      {reviews.length > 0 && (
        <section className="block"><div className="wrap stack" style={{ gap: 24 }}>
          <div className="stack" style={{ gap: 4 }}><span className="eyebrow">{t('reviews')}</span><h2>{t('reviewsTitle')}</h2></div>
          <div className="grid g3">{reviews.map((r, k) => (
            <div key={k} className="panel review"><span className="stars">{'★'.repeat(r.rating)}</span><p>{r.body}</p>
              <span className="small muted">{tr(r.listing_title, lang)}</span></div>))}
          </div>
        </div></section>
      )}

      <section className="block"><div className="wrap stack" style={{ gap: 24 }}>
        <h2>{t('whyTitle')}</h2>
        <div className="why">{[1, 2, 3, 4].map((n) => <div key={n} className="panel"><h3>{t(`why${n}`)}</h3><p className="muted small">{t(`why${n}t`)}</p></div>)}</div>
        <div className="panel row between" style={{ background: 'var(--accent-soft)', border: 0 }}>
          <div className="stack" style={{ gap: 4 }}><h3>{t('nlTitle')}</h3><p className="small muted">{t('nlText')}</p></div>
          <Newsletter lang={lang} label={t('subscribe')} />
        </div>
      </div></section>
    </>
  );
}
