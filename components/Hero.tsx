'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { InstagramIcon } from './Icons';

type Slide = { slug: string; name: string; country: string; img: string | null };
type Labels = { eyebrowAll: string; destination: string; allDest: string; arrival: string; departure: string; travelers: string;
  searchType: string; typeH: string; typeE: string; exploreBtn: string; title: string; sub: string; group: string; instagram: string };

/** Bannière d'accueil : diaporama des destinations qui se fige sur la destination choisie. */
export function Hero({ slides, labels, action, defaults, instagramUrl }: { slides: Slide[]; labels: Labels; action: string; defaults: { in: string; out: string }; instagramUrl: string }) {
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [fixed, setFixed] = useState<string | null>(null);
  const [dest, setDest] = useState('');
  const idxRef = useRef(0);

  const show = (i: number) => {
    const n = (i + slides.length) % slides.length;
    if (n === idxRef.current) return;
    setPrev(idxRef.current); idxRef.current = n; setIdx(n);
  };
  useEffect(() => {
    if (fixed || slides.length < 2) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = setInterval(() => { if (!document.hidden) show(idxRef.current + 1); }, 5500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixed, slides.length]);

  const pick = (slug: string) => {
    if (fixed === slug) { setFixed(null); setDest(''); return; }
    setFixed(slug); setDest(slug); show(slides.findIndex((s) => s.slug === slug));
  };
  const cur = fixed ? slides.find((s) => s.slug === fixed) : null;

  return (
    <section className="hero">
      <div className="slides" aria-hidden="true">
        {slides.map((s, k) => (
          <div key={s.slug} className={`slide ${k === idx ? 'on' : k === prev ? 'out' : ''} ${prev === null ? 'noanim' : ''}`}>
            {s.img && <Image src={s.img} alt="" fill sizes="100vw" priority={k === 0} quality={70} />}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(6,40,36,.78),rgba(6,40,36,.12))' }} />
      <a className="hero-ig" href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label={labels.instagram} title={labels.instagram}>
        <InstagramIcon size={24} /><span>@stayndiscover</span>
      </a>
      <div className="wrap">
        <span className="eyebrow" style={{ color: 'var(--sun)' }}>{cur ? `${cur.name} · ${cur.country}` : labels.eyebrowAll}</span>
        <h1>{labels.title}</h1>
        <p className="sub">{labels.sub}</p>
        <div className="hero-dots" role="group" aria-label={labels.group}>
          {slides.map((s, k) => (
            <button key={s.slug} type="button" className={k === idx ? 'on' : ''} aria-pressed={fixed === s.slug} onClick={() => pick(s.slug)}>
              {s.name}{fixed === s.slug && <span className="lock" aria-hidden="true">●</span>}
            </button>
          ))}
        </div>
        <form className="search" action={action} method="get">
          <label className="f">{labels.destination}
            <select name="dest" value={dest} onChange={(e) => { setDest(e.target.value); if (e.target.value && slides.some((s) => s.slug === e.target.value)) { setFixed(e.target.value); show(slides.findIndex((s) => s.slug === e.target.value)); } else setFixed(null); }}>
              <option value="">{labels.allDest}</option>
              {slides.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
          </label>
          <label className="f">{labels.arrival}<input type="date" name="in" defaultValue={defaults.in} /></label>
          <label className="f">{labels.departure}<input type="date" name="out" defaultValue={defaults.out} /></label>
          <label className="f">{labels.travelers}<input type="number" name="tr" min={1} max={20} defaultValue={2} /></label>
          <label className="f">{labels.searchType}
            <select name="type" defaultValue="hebergement">
              <option value="hebergement">{labels.typeH}</option>
              <option value="excursion">{labels.typeE}</option>
            </select>
          </label>
          <button className="btn sun" type="submit">{labels.exploreBtn}</button>
        </form>
      </div>
    </section>
  );
}
