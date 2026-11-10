'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { InstagramIcon } from './Icons';

type Slide = { slug: string; name: string; country: string; img: string | null; video?: string | null };

/** Premiers plans détourés (palmiers, récif, dune + chameau) : le nom géant passe DERRIÈRE eux, comme sur la référence Pinterest. */
const FG: Record<string, { img: string; videoMask?: string }> = {
  martinique: { img: '/images/premier-plan/martinique.webp' },
  belize: { img: '/images/premier-plan/belize.webp' },
  maroc: { img: '/images/premier-plan/maroc.webp', videoMask: '/images/premier-plan/maroc-video-dune.png' },
};

// Vidéo du Maroc : la dune ne bouge pas (un seul masque) ; le chameau marche, il a donc 61 masques
// (12 par seconde, cases de 240×260 px, 10 par ligne) et leur position dans l'image (x,y) pour chaque instant.
const CAMEL = { src: '/images/premier-plan/maroc-video-chameau.png', fps: 12, count: 61, w: 240, h: 260, cols: 10,
  pos: [357,191,358,191,361,190,362,191,366,189,370,188,374,185,379,180,382,181,386,180,389,181,393,183,397,186,401,184,405,185,405,184,409,182,413,182,417,180,422,177,427,177,432,171,434,171,436,172,439,171,436,179,445,175,448,175,450,174,453,172,458,168,461,166,464,164,466,163,469,165,471,164,474,165,478,166,481,168,484,168,484,170,487,167,491,166,494,166,498,165,503,160,507,159,509,157,510,157,513,158,514,161,518,159,521,162,523,160,524,160,527,160,529,157,531,158,532,154,534,154,536,157] };
const SHADE: [number, number] = [0.78, 0.12]; // même voile sombre que le reste du bandeau (gauche → droite)

/** Premier plan d'une vidéo : la vidéo est redessinée image par image, découpée par le masque (une seule vidéo chargée). */
function VideoForeground({ video, mask, active }: { video: () => HTMLVideoElement | null; mask: string; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active) return;
    const c = ref.current, v = video();
    if (!c || !v) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const m = new window.Image(); m.src = mask;
    const cam = new window.Image(); cam.src = CAMEL.src;
    const mc = document.createElement('canvas'); const mctx = mc.getContext('2d');
    let raf = 0;
    const draw = () => {
      if (v.readyState >= 2 && m.complete && m.naturalWidth) {
        if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(v, 0, 0, c.width, c.height);
        // masque de l'instant : dune + chameau à sa position du moment
        if (mctx) {
          if (mc.width !== c.width) { mc.width = c.width; mc.height = c.height; }
          mctx.clearRect(0, 0, mc.width, mc.height);
          mctx.drawImage(m, 0, 0, mc.width, mc.height);
          if (cam.complete && cam.naturalWidth) {
            const f = Math.min(CAMEL.count - 1, Math.floor(v.currentTime * CAMEL.fps));
            const sx = mc.width / 1280, sy = mc.height / 720;
            mctx.drawImage(cam, (f % CAMEL.cols) * CAMEL.w, Math.floor(f / CAMEL.cols) * CAMEL.h, CAMEL.w, CAMEL.h,
              CAMEL.pos[2 * f] * sx, CAMEL.pos[2 * f + 1] * sy, CAMEL.w * sx, CAMEL.h * sy);
          }
          ctx.globalCompositeOperation = 'destination-in';
          ctx.drawImage(mc, 0, 0);
        }
        // voile sombre identique au décor, calculé sur la partie visible de la vidéo (recadrage « cover »)
        const k = Math.max(c.clientWidth / c.width, c.clientHeight / c.height) || 1;
        const x0 = (c.width - c.clientWidth / k) / 2;
        const g = ctx.createLinearGradient(x0, 0, c.width - x0, 0);
        g.addColorStop(0, `rgba(6,40,36,${SHADE[0]})`); g.addColorStop(1, `rgba(6,40,36,${SHADE[1]})`);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, mask, video]);
  return <canvas ref={ref} className="slide-fg slide-fg-video" aria-hidden="true" />;
}
type Labels = { eyebrowAll: string; destination: string; allDest: string; arrival: string; departure: string; travelers: string;
  searchType: string; typeH: string; typeE: string; exploreBtn: string; title: string; sub: string; group: string; instagram: string };

/** Bannière d'accueil : diaporama des destinations qui se fige sur la destination choisie. */
export function Hero({ slides, labels, action, defaults, instagramUrl }: { slides: Slide[]; labels: Labels; action: string; defaults: { in: string; out: string }; instagramUrl: string }) {
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [fixed, setFixed] = useState<string | null>(null);
  const [dest, setDest] = useState('');
  const idxRef = useRef(0);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const [motionOk, setMotionOk] = useState(false);

  // Les vidéos ne se lancent que si le visiteur n'a pas demandé moins d'animations ni l'économiseur de données
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    setMotionOk(!reduce && !saveData);
  }, []);
  // Seule la vidéo de la diapositive affichée joue ; les autres sont en pause (économie de batterie et de données)
  useEffect(() => {
    videos.current.forEach((v, k) => {
      if (!v) return;
      if (k === idx && motionOk) { v.currentTime = 0; v.play().catch(() => {}); } else if (k !== prev) { v.pause(); }
    });
  }, [idx, prev, motionOk]);

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
  const getters = useRef<Record<number, () => HTMLVideoElement | null>>({});
  const getVideo = (k: number) => (getters.current[k] ??= () => videos.current[k] ?? null);
  // Le nom géant s'aligne sur l'emplacement réservé dans la colonne de texte
  const heroRef = useRef<HTMLElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const place = () => {
      const h = heroRef.current, sp = spaceRef.current;
      if (!h || !sp) return;
      // taille du nom géant : chaque nom remplit la largeur disponible (au plus 190 px de haut)
      let max = 0;
      h.querySelectorAll<HTMLElement>('.bigname span').forEach((el) => {
        const box = el.parentElement as HTMLElement;
        const avail = box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight);
        el.style.fontSize = '100px';
        const fs = Math.min(190, Math.floor((avail / el.scrollWidth) * 100));
        el.style.fontSize = `${fs}px`; max = Math.max(max, fs);
      });
      if (max) h.style.setProperty('--fsmax', `${max}px`);
      h.style.setProperty('--bn-top', `${sp.getBoundingClientRect().top - h.getBoundingClientRect().top}px`);
    };
    place();
    document.fonts?.ready.then(place).catch(() => {});
    const ro = new ResizeObserver(place);
    if (heroRef.current) ro.observe(heroRef.current);
    return () => ro.disconnect();
  }, []);
  const nmin = Math.min(...slides.map((s) => s.name.length));

  return (
    <section className="hero hero-names" ref={heroRef} style={{ '--nmin': nmin } as React.CSSProperties}>
      <div className="slides" aria-hidden="true">
        {slides.map((s, k) => (
          <div key={s.slug} className={`slide fx-${s.slug} ${s.video && motionOk ? 'has-video' : ''} ${k === idx ? 'on' : k === prev ? 'out' : ''} ${prev === null ? 'noanim' : ''}`}>
            {s.img && <Image src={s.img} alt="" fill sizes="100vw" priority={k === 0} quality={70} />}
            {s.video && motionOk && (
              <video ref={(el) => { videos.current[k] = el; }} className="slide-video" src={s.video} muted loop playsInline
                preload={k === idx ? 'auto' : 'metadata'} aria-hidden="true" />
            )}
            {/* effets d'ambiance propres à chaque destination (reflets, sable…) */}
            <span className="fx fx-a" /><span className="fx fx-b" />
            <span className="slide-shade" />
            {/* nom géant de la destination, glissé entre le décor et le premier plan */}
            <div className="bigname" style={{ '--n': s.name.length } as React.CSSProperties}><div className="in"><span>{s.name}</span></div></div>
            {FG[s.slug] && (s.video && motionOk && FG[s.slug].videoMask
              ? <VideoForeground video={getVideo(k)} mask={FG[s.slug].videoMask!} active={k === idx || k === prev} />
              : (!s.video || !motionOk) && <>
                  <Image className="slide-fg" src={FG[s.slug].img} alt="" fill sizes="100vw" priority={k === 0} quality={70} />
                  <span className="slide-shade fg-shade" style={{ maskImage: `url(${FG[s.slug].img})`, WebkitMaskImage: `url(${FG[s.slug].img})` }} />
                </>)}
          </div>
        ))}
      </div>
      <div className="hero-shade" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(6,40,36,.78),rgba(6,40,36,.12))' }} />
      <a className="hero-ig" href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label={labels.instagram} title={labels.instagram}>
        <InstagramIcon size={24} /><span>@stayndiscover</span>
      </a>
      <div className="wrap">
        <span className="eyebrow" style={{ color: 'var(--sun)' }}>{cur ? `${cur.name} · ${cur.country}` : labels.eyebrowAll}</span>
        <div className="bigname-space" ref={spaceRef} aria-hidden="true" />
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
