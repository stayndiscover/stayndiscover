'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type Opt = { value: string; label: string };
type Cat = { slug: string; type: string; label: string };
export type ExplorerValues = { q: string; dest: string; type: string; sub: string; max: string; in: string; out: string; tr: string };

/**
 * Filtres d'Explorer : la liste se met à jour toute seule à chaque choix, sans bouton « Rechercher ».
 * Les champs à saisir (texte, prix) attendent une courte pause de frappe avant de lancer la recherche.
 */
export function ExplorerShell({ initial, dests, cats, l, children }: {
  initial: ExplorerValues; dests: Opt[]; cats: Cat[]; l: Record<string, string>; children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  // si l'adresse change (lien, retour arrière), on recale les champs
  useEffect(() => { setV(initial); }, [JSON.stringify(initial)]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (next: ExplorerValues, delay = 0) => {
    setV(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const datesOk = next.in && next.out && next.out > next.in;
      const params = Object.entries({ ...next, in: datesOk ? next.in : '', out: datesOk ? next.out : '', tr: datesOk ? next.tr : '' })
        .filter(([, x]) => x) as [string, string][];
      const qs = new URLSearchParams(params).toString();
      startTransition(() => router.replace(`${pathname}${qs ? '?' + qs : ''}`, { scroll: false }));
    }, delay);
  };
  useEffect(() => { first.current = false; }, []);
  const set = (k: keyof ExplorerValues, delay = 0) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const next = { ...v, [k]: e.target.value };
    if (k === 'type') next.sub = cats.find((c) => c.slug === v.sub && c.type === e.target.value) ? v.sub : '';
    apply(next, delay);
  };
  const subs = cats.filter((c) => !v.type || c.type === v.type);

  return (
    <>
      <form className="panel stack" style={{ marginBottom: 20 }} role="search" onSubmit={(e) => { e.preventDefault(); apply(v); }}>
        <div className="form">
          <label className="f">{l.search}<input type="search" value={v.q} placeholder={l.searchPh} onChange={set('q', 350)} /></label>
          <label className="f">{l.destination}<select value={v.dest} onChange={set('dest')}><option value="">{l.allDest}</option>
            {dests.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
          <label className="f">{l.category}<select value={v.type} onChange={set('type')}><option value="">{l.all}</option>
            <option value="hebergement">{l.typeH}</option><option value="excursion">{l.typeE}</option><option value="lieu">{l.typeL}</option></select></label>
          <label className="f">{l.arrival}<input type="date" value={v.in} onChange={set('in')} /></label>
          <label className="f">{l.departure}<input type="date" value={v.out} min={v.in || undefined} onChange={set('out')} /></label>
          <label className="f">{l.travelers}<input type="number" min={1} max={30} value={v.tr} onChange={set('tr', 350)} /></label>
          <label className="f">{l.maxPrice}<input type="number" min={0} step={10} value={v.max} onChange={set('max', 450)} /></label>
          {(v.q || v.dest || v.type || v.sub || v.max || v.in || v.out) && (
            <div className="f" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={() => apply({ q: '', dest: '', type: '', sub: '', max: '', in: '', out: '', tr: '2' })}>{l.reset}</button>
            </div>
          )}
        </div>
        <div className="chips" role="group" aria-label={l.category}>
          <button type="button" className={`chip ${!v.sub ? 'on' : ''}`} aria-pressed={!v.sub} onClick={() => apply({ ...v, sub: '' })}>{l.all}</button>
          {subs.map((c) => (
            <button key={c.slug} type="button" className={`chip ${v.sub === c.slug ? 'on' : ''}`} aria-pressed={v.sub === c.slug}
              onClick={() => apply({ ...v, sub: v.sub === c.slug ? '' : c.slug, type: v.type || c.type })}>{c.label}</button>
          ))}
        </div>
      </form>
      <div className="explorer-results" aria-busy={pending} style={{ opacity: pending ? 0.45 : 1, transition: 'opacity .2s' }}>{children}</div>
    </>
  );
}
