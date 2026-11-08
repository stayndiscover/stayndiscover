'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const KEY = 'sd_planner_nudge';
const MONTH = 30 * 24 * 3600 * 1000;

/**
 * Proposition discrète du planificateur (§ 3.3) : après 3 fiches consultées, une seule fois par mois,
 * et jamais pour quelqu'un qui a déjà un séjour.
 */
export function PlannerNudge({ href, hasTrip, l }: { href: string; hasTrip: boolean; l: { title: string; text: string; go: string; later: string } }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (hasTrip) return;
    try {
      const st = JSON.parse(localStorage.getItem(KEY) || '{}') as { views?: number; shownAt?: number };
      const views = (st.views ?? 0) + 1;
      const due = views >= 3 && (!st.shownAt || Date.now() - st.shownAt > MONTH);
      localStorage.setItem(KEY, JSON.stringify({ views: due ? 0 : views, shownAt: due ? Date.now() : st.shownAt }));
      if (due) { const id = setTimeout(() => setShow(true), 1500); return () => clearTimeout(id); }
    } catch { /* navigation privée : pas de proposition */ }
  }, [hasTrip]);
  if (!show) return null;
  return (
    <aside className="nudge" role="dialog" aria-labelledby="nudge-t" aria-live="polite">
      <b id="nudge-t">{l.title}</b>
      <p className="small muted">{l.text}</p>
      <div className="row">
        <Link className="btn sm sun" href={href}>{l.go}</Link>
        <button type="button" className="btn sm ghost" onClick={() => setShow(false)}>{l.later}</button>
      </div>
    </aside>
  );
}
