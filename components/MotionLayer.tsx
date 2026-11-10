'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Couche d'animations du site (n'ajoute aucun contenu, ne change pas la mise en page) :
 *  1. apparitions au défilement (fondu, glissement, zoom) — les cibles sont choisies en CSS (globals.css, « Animations ») ;
 *  2. parallaxe légère sur les grandes images (bandeau d'accueil, en-têtes de destination, cartes destinations) ;
 *  3. l'avion du logo qui s'envole et descend avec le défilement.
 * Tout passe par transform/opacity (rapide), un seul requestAnimationFrame, et rien ne bouge si le visiteur
 * a demandé « réduire les animations » dans son appareil.
 */

// Position de l'avion dans /images/logo-symbole.png (202×160 px) : x, y, largeur, hauteur.
const PLANE_IN_LOGO = { x: 117 / 202, y: 2 / 160, w: 47 / 202 };
// Ratio de l'image /images/logo-avion.png (89×38 px), découpée dans le vrai logo.
const PLANE_RATIO = 38 / 89;

const REVEAL = [
  'main .block .eyebrow', 'main .block h2', 'main .grid > *', 'main .destcard', 'main .why > *',
  'main .plan-band', 'main .panel', 'main .card', 'footer.bottom .wrap > *',
].join(',');

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export function MotionLayer() {
  const path = usePathname();
  const plane = useRef<HTMLImageElement>(null);

  // 1. Apparitions au défilement
  useEffect(() => {
    const root = document.documentElement;
    (window as unknown as { __fx?: boolean }).__fx = true;
    if (!root.classList.contains('fx-on')) return;
    const io = new IntersectionObserver((entries) => {
      // petit décalage entre les éléments qui entrent ensemble (cartes d'une même rangée)
      let i = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.style.setProperty('--fx-d', `${Math.min(i++, 5) * 80}ms`);
        el.classList.add('fx-in');
        io.unobserve(el);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const scan = () => document.querySelectorAll<HTMLElement>(REVEAL).forEach((el) => {
      if (el.dataset.fx) return;
      el.dataset.fx = '1';
      io.observe(el);
    });
    scan();
    // contenus ajoutés après coup (filtres de l'explorateur, onglets du séjour…)
    const mo = new MutationObserver(() => scan());
    const main = document.getElementById('contenu');
    if (main) mo.observe(main, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [path]);

  // 2. Parallaxe + 3. avion
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches) return;
    const img = plane.current;
    const cur = { x: 0, y: 0, s: 1, a: 0, flip: 1, o: 0 };
    let started = false, raf = 0, last = -1, idle = 0;
    let pars: HTMLElement[] = [], cards: HTMLElement[] = [], heroTxt: HTMLElement[] = [];
    const collect = () => {
      pars = Array.from(document.querySelectorAll<HTMLElement>('main .hero .slides, main .hero .bgart'));
      heroTxt = Array.from(document.querySelectorAll<HTMLElement>('main .hero > .wrap'));
      cards = Array.from(document.querySelectorAll<HTMLElement>('main .destcard .art'));
    };
    collect();

    const frame = () => {
      raf = 0;
      const sy = window.scrollY, vh = window.innerHeight, vw = window.innerWidth;
      // — parallaxe : le décor du bandeau descend plus lentement que la page
      if (sy !== last) {
        for (const el of pars) if (sy < vh * 1.5) el.style.transform = `translate3d(0,${(sy * 0.35).toFixed(1)}px,0)`;
        for (const el of heroTxt) if (sy < vh * 1.5) el.style.transform = `translate3d(0,${(sy * 0.12).toFixed(1)}px,0)`;
        for (const el of cards) {
          const r = el.parentElement!.getBoundingClientRect();
          if (r.bottom < -50 || r.top > vh + 50) continue;
          const off = ((r.top + r.height / 2 - vh / 2) / vh) * -36;
          el.style.transform = `translate3d(0,${off.toFixed(1)}px,0)`;
        }
      }
      // — l'avion
      if (img) {
        const logo = document.querySelector<HTMLImageElement>('header.top .logo-sym');
        const lr = logo?.getBoundingClientRect();
        if (lr && lr.width) {
          const w0 = lr.width * PLANE_IN_LOGO.w;
          const sx = lr.left + lr.width * PLANE_IN_LOGO.x, sy0 = lr.top + lr.height * PLANE_IN_LOGO.y;
          const doc = document.documentElement.scrollHeight - vh;
          const p = clamp(doc > 0 ? sy / doc : 0);
          const t = smooth(0, Math.min(420, vh * 0.6), sy); // décollage dès les premiers pixels de défilement
          const mobile = vw < 700;
          const wFly = mobile ? 40 : 58;
          const scale = (w0 + (wFly - w0) * t) / w0;
          // trajectoire : du logo vers le bas de l'écran, en ondulant doucement de gauche à droite
          const ex = vw * (mobile ? 0.62 : 0.55), ey = vh - (mobile ? 70 : 110);
          const e = easeInOut(p);
          const amp = (mobile ? vw * 0.26 : Math.min(vw * 0.3, 320)) * smooth(0.02, 0.15, p);
          let x = sx + (ex - sx) * e + (mobile ? 40 : 140) * t * (1 - e) + amp * Math.sin(p * Math.PI * 2 * 2.25);
          let y = sy0 + (ey - sy0) * e + (mobile ? 70 : 90) * t * (1 - e) + 14 * Math.sin(p * Math.PI * 2 * 6) * t;
          x = clamp(x, 6, vw - wFly - 6); y = clamp(y, sy0, vh - 40);
          // lissage : l'avion « rattrape » sa place, ce qui donne un vol souple
          const k = started ? 0.12 : 1;
          const dx = x - cur.x, dy = y - cur.y;
          cur.x += dx * k; cur.y += dy * k; cur.s += (scale - cur.s) * k;
          if (Math.abs(dx) > 0.6) cur.flip += ((dx >= 0 ? 1 : -1) - cur.flip) * 0.15;
          const target = t < 0.02 ? 0 : clamp(Math.atan2(dy, Math.abs(dx) + 4) * 57.3 * 0.6, -18, 26);
          cur.a += (target - cur.a) * 0.1;
          started = true;
          img.style.width = `${w0}px`;
          img.style.transform = `translate3d(${cur.x.toFixed(1)}px,${cur.y.toFixed(1)}px,0) scale(${(cur.s * cur.flip).toFixed(3)},${cur.s.toFixed(3)}) rotate(${cur.a.toFixed(2)}deg)`;
          img.style.opacity = '1';
          const moving = Math.abs(dx) + Math.abs(dy) > 0.3 || Math.abs(target - cur.a) > 0.2;
          idle = moving ? 0 : idle + 1;
        }
      }
      last = sy;
      if (idle < 3) raf = requestAnimationFrame(frame);
    };
    const kick = () => { idle = 0; if (!raf) raf = requestAnimationFrame(frame); };
    const onResize = () => { collect(); kick(); };
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', onResize);
    const t1 = setTimeout(() => { collect(); kick(); }, 400); // après le chargement des images
    kick();
    return () => {
      window.removeEventListener('scroll', kick); window.removeEventListener('resize', onResize);
      clearTimeout(t1); if (raf) cancelAnimationFrame(raf);
    };
  }, [path]);

  // l'avion part du logo : même image, posée exactement sur l'avion du logo, puis il s'envole
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={plane} className="fly-plane" src="/images/logo-avion.png" alt="" aria-hidden="true" width={89} height={38} style={{ aspectRatio: `${1 / PLANE_RATIO}` }} />;
}
