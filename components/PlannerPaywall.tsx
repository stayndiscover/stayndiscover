'use client';
import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { unlockPlanner } from '@/app/actions';

type L = { title: string; text: string; gemT: string; gem: string; items: [string, string][]; keep: string; once: string;
  btn: string; later: string; pending: string; close: string; price: string };

const sw = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
/** Pictogrammes dessinés pour le site (pas de logos de marques). */
const ICONS = [
  <svg key="map" viewBox="0 0 48 48" aria-hidden="true"><path d="M6 12l11-4 14 5 11-4v27l-11 4-14-5-11 4z" fill="#e3f3ef" stroke="#0f6b5c" strokeWidth="1.8" strokeLinejoin="round" /><path d="M17 8v27M31 13v27" stroke="#0f6b5c" strokeWidth="1.4" opacity=".5" /><path d="M34 6c-4.4 0-8 3.4-8 7.7C26 19.5 34 27 34 27s8-7.5 8-13.3C42 9.4 38.4 6 34 6z" fill="#e5533d" /><circle cx="34" cy="13.5" r="3" fill="#fff" /></svg>,
  <svg key="cal" viewBox="0 0 48 48" aria-hidden="true" style={{ color: '#0f6b5c' }}><rect x="7" y="10" width="34" height="31" rx="5" {...sw} strokeWidth={2.4} /><path d="M7 18h34M16 6v8M32 6v8" {...sw} strokeWidth={2.4} />{[0, 1, 2, 3].map((c) => [0, 1].map((r) => <circle key={`${c}${r}`} cx={15 + c * 6} cy={26 + r * 7} r="1.8" fill="currentColor" />))}</svg>,
  <svg key="mod" viewBox="0 0 48 48" aria-hidden="true" style={{ color: '#0f6b5c' }}><path d="M7 13h34M7 24h34M7 35h34" {...sw} strokeWidth={2.4} /><circle cx="30" cy="13" r="4" {...sw} fill="#fff" strokeWidth={2.4} /><circle cx="17" cy="24" r="4" {...sw} fill="#fff" strokeWidth={2.4} /><circle cx="27" cy="35" r="4" {...sw} fill="#fff" strokeWidth={2.4} /></svg>,
  <svg key="pdf" viewBox="0 0 48 48" aria-hidden="true" style={{ color: '#0f6b5c' }}><path d="M12 5h18l9 9v29H12z" {...sw} strokeWidth={2.4} /><path d="M30 5v9h9" {...sw} strokeWidth={2.4} /><text x="25.5" y="33" textAnchor="middle" fontSize="10" fontWeight="800" fill="currentColor" fontFamily="inherit">PDF</text></svg>,
];
const Spark = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 40 30" aria-hidden="true"><path d="M8 18L4 4M18 20l9-12M20 27l14-3" fill="none" stroke="#f2b02f" strokeWidth="4" strokeLinecap="round" /></svg>
);

/** Fenêtre de déblocage du planificateur (19,99 € par séjour). La sélection du voyageur n'est jamais touchée. */
export function PlannerPaywall({ lang, trip, path, closeHref, pending, img, l }: {
  lang: string; trip: string; path: string; closeHref: string; pending: boolean; img: string | null; l: L;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const close = () => router.replace(closeHref, { scroll: false });
  // Le mot souligné en jaune : le dernier mot du titre, sans le « ! » (ex. « autrement »).
  const m = l.title.match(/^(.*?)(\S+?)(\s?[!¡?.]*)$/u) ?? ['', l.title, '', ''];
  const [, head, hl, tail] = m;
  return (
    <dialog ref={ref} className="paywall" aria-labelledby="pw-title" onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === ref.current) close(); }}>
      <div className="paywall-in">
        <button type="button" className="iconbtn paywall-x" aria-label={l.close} onClick={close}>✕</button>
        <span className="eyebrow">StayNdiscover</span>
        <h2 id="pw-title" className="pw-title">{head}<span className="pw-hl">{hl}</span>{tail}<Spark className="pw-spark" /></h2>
        <p className="pw-lead">{l.text}</p>
        <div className="pw-gem">
          <div className="pw-gem-pic">
            {img && <Image src={img} alt="" fill sizes="160px" quality={70} />}
            <svg className="pw-pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c-4 0-7 3-7 6.9 0 5.2 7 12.1 7 12.1s7-6.9 7-12.1c0-3.9-3-6.9-7-6.9z" fill="none" stroke="#fff" strokeWidth="2.2" /><circle cx="12" cy="9.5" r="2.6" fill="none" stroke="#fff" strokeWidth="2.2" /></svg>
          </div>
          <div className="pw-gem-txt">
            <h3><span aria-hidden="true">⭐</span> {l.gemT}</h3>
            <p>{l.gem}</p>
          </div>
        </div>
        <ul className="pw-items">
          {l.items.map(([h, p], i) => (
            <li key={h}><span className="pw-check" aria-hidden="true">✓</span><span className="pw-ico">{ICONS[i]}</span>
              <span className="pw-it"><b>{h}</b><span>{p}</span></span></li>
          ))}
        </ul>
        <div className="pw-price"><b className="num">{l.price}</b><span>{l.once}</span></div>
        <p className="pw-keep">✓ {l.keep}</p>
        {pending ? (
          <div className="notice info" role="status">{l.pending}</div>
        ) : (
          <form action={unlockPlanner} className="stack" style={{ gap: 8 }}>
            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="trip" value={trip} /><input type="hidden" name="path" value={path} />
            <button className="btn sun pw-buy" type="submit">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.4" /></svg>
              <span>{l.btn}</span><span aria-hidden="true">›</span>
            </button>
          </form>
        )}
        <button type="button" className="btn ghost pw-later" onClick={close}>{l.later}</button>
      </div>
    </dialog>
  );
}
