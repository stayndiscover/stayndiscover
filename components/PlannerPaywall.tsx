'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { unlockPlanner } from '@/app/actions';

type L = { title: string; text: string; b1: string; b2: string; b3: string; keep: string; once: string; btn: string; later: string;
  pending: string; close: string; price: string };

/** Fenêtre de déblocage du planificateur (19,99 € par séjour). La sélection du voyageur n'est jamais touchée. */
export function PlannerPaywall({ lang, trip, path, closeHref, pending, l }: {
  lang: string; trip: string; path: string; closeHref: string; pending: boolean; l: L;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const close = () => router.replace(closeHref, { scroll: false });
  return (
    <dialog ref={ref} className="paywall" aria-labelledby="pw-title" onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === ref.current) close(); }}>
      <div className="paywall-in">
        <button type="button" className="iconbtn paywall-x" aria-label={l.close} onClick={close}>✕</button>
        <span className="eyebrow">StayNdiscover</span>
        <h2 id="pw-title">{l.title}</h2>
        <p className="muted">{l.text}</p>
        <ul className="paywall-list">
          <li>{l.b1}</li><li>{l.b2}</li><li>{l.b3}</li>
        </ul>
        <div className="paywall-price"><b className="num">{l.price}</b><span className="small muted">{l.once}</span></div>
        <p className="small" style={{ color: 'var(--ok)', fontWeight: 600 }}>✓ {l.keep}</p>
        {pending ? (
          <div className="notice info" role="status">{l.pending}</div>
        ) : (
          <form action={unlockPlanner} className="stack" style={{ gap: 8 }}>
            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="trip" value={trip} /><input type="hidden" name="path" value={path} />
            <button className="btn sun" type="submit">{l.btn}</button>
          </form>
        )}
        <button type="button" className="btn ghost" onClick={close}>{l.later}</button>
      </div>
    </dialog>
  );
}
