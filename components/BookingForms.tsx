'use client';
import { useActionState, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { addExcursionToCart, addStayToCart, type FormState } from '@/app/actions';

type L = Record<string, string>;
const fmt = (v: number, lang: string) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);

export function StayForm({ lang, units, labels, defaults, path }: {
  lang: string; path: string; labels: L; defaults: { in: string; out: string; adults: number };
  units: { id: string; name: string; max: number; min: number; price: number }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addStayToCart, null);
  const [unit, setUnit] = useState(units[0]?.id ?? '');
  const [dIn, setIn] = useState(defaults.in);
  const [dOut, setOut] = useState(defaults.out);
  const [adults, setAdults] = useState(defaults.adults);
  const [children, setChildren] = useState(0);
  const [quote, setQuote] = useState<{ nights?: number; lodging?: number; cleaning?: number; total?: number; available?: boolean; error?: string } | null>(null);
  const u = units.find((x) => x.id === unit);

  useEffect(() => {
    if (!unit || !dIn || !dOut) return;
    if (dOut <= dIn) { setQuote({ error: labels.errDates }); return; }
    const ctl = new AbortController();
    fetch(`/api/quote?unit=${unit}&in=${dIn}&out=${dOut}&g=${adults + children}`, { signal: ctl.signal })
      .then((r) => r.json()).then(setQuote).catch(() => {});
    return () => ctl.abort();
  }, [unit, dIn, dOut, adults, children, labels.errDates]);

  const errText = (e: string) => (/minimum (\d+)/.test(e) ? labels.minStay.replace('{0}', e.match(/(\d+)/)![1])
    : /(\d+) voyageurs/.test(e) ? labels.tooMany.replace('{0}', e.match(/(\d+)/)![1]) : labels.errDates);
  const ok = quote && !quote.error && quote.available;

  return (
    <form className="panel stack sticky" action={action}>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={path} />
      <div><span className="small muted">{labels.from} </span><span className="price num">{fmt(u?.price ?? 0, lang)}</span> <span className="muted small">{labels.perNight}</span></div>
      {units.length > 1 ? (
        <label className="f">{labels.accom}<select name="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
          {units.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      ) : <input type="hidden" name="unit" value={unit} />}
      <div className="form" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="f">{labels.arrival}<input type="date" name="start_date" value={dIn} required onChange={(e) => setIn(e.target.value)} /></label>
        <label className="f">{labels.departure}<input type="date" name="end_date" value={dOut} required onChange={(e) => setOut(e.target.value)} /></label>
        <label className="f">{labels.adults}<input type="number" name="adults" min={1} max={u?.max} value={adults} onChange={(e) => setAdults(Math.max(1, +e.target.value || 1))} /></label>
        <label className="f">{labels.children}<input type="number" name="children" min={0} max={u?.max} value={children} onChange={(e) => setChildren(Math.max(0, +e.target.value || 0))} /></label>
      </div>
      <div className="small" aria-live="polite">
        {quote?.error && <div className="notice bad">{errText(quote.error)}</div>}
        {quote && !quote.error && !quote.available && <div className="notice bad">{labels.datesTaken}</div>}
        {ok && (
          <div className="notice ok stack" style={{ gap: 2 }}>
            <span className="row between"><span>{quote.nights} {labels.nights}</span><b className="num">{fmt(quote.lodging!, lang)}</b></span>
            {Number(quote.cleaning) > 0 && <span className="row between"><span>{labels.cleaning}</span><span className="num">{fmt(quote.cleaning!, lang)}</span></span>}
            <span className="row between"><b>{labels.total}</b><b className="num">{fmt(quote.total!, lang)}</b></span>
          </div>
        )}
      </div>
      {state?.error && <div className="notice bad" role="alert">{state.error}</div>}
      <button className="btn sun" type="submit" disabled={pending || !ok}>{labels.addCart}</button>
      <p className="small muted">{labels.rules}</p>
    </form>
  );
}

export function ExcursionForm({ lang, path, labels, date, dates, slots, maxSeats, priceFrom }: {
  lang: string; path: string; labels: L; date: string; dates: string[]; maxSeats: number; priceFrom: number;
  slots: { id: string; time: string; left: number; adult: number; child: number | null; meeting: string | null }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addExcursionToCart, null);
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const firstOpen = slots.find((s) => s.left > 0)?.id ?? '';
  const [slot, setSlot] = useState(firstOpen);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  useEffect(() => setSlot(firstOpen), [firstOpen]);
  const s = slots.find((x) => x.id === slot);
  const total = s ? s.adult * adults + (s.child ?? s.adult) * children : 0;
  const goDate = (d: string) => { const q = new URLSearchParams(sp); q.set('date', d); router.replace(`${pathname}?${q}`, { scroll: false }); };

  return (
    <form className="panel stack sticky" action={action}>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={path} />
      <div><span className="price num">{fmt(priceFrom, lang)}</span> <span className="muted small">{labels.perPers}</span></div>
      <label className="f">{labels.date}<input type="date" value={date} onChange={(e) => e.target.value && goDate(e.target.value)} /></label>
      {dates.length > 0 && (
        <div className="chips" aria-label={labels.pickDate}>
          {dates.slice(0, 6).map((d) => (
            <button key={d} type="button" className={`chip ${d === date ? 'on' : ''}`} onClick={() => goDate(d)}>
              {new Date(d + 'T12:00:00').toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' })}
            </button>))}
        </div>
      )}
      {slots.length ? (
        <fieldset className="slots" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small muted" style={{ marginBottom: 6 }}>{labels.time}</legend>
          {slots.map((x) => (
            <label key={x.id} className={x.left <= 0 ? 'full' : ''}>
              <input type="radio" name="slot" value={x.id} checked={slot === x.id} disabled={x.left <= 0} onChange={() => setSlot(x.id)} />
              <b>{x.time}</b> <span className="small muted">{labels.seatsLeft.replace('{0}', String(Math.max(0, x.left)))}</span>
            </label>))}
        </fieldset>
      ) : <div className="notice bad">{labels.noSlots}</div>}
      <div className="form" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="f">{labels.adults}<input type="number" name="adults" min={0} max={maxSeats} value={adults} onChange={(e) => setAdults(Math.max(0, +e.target.value || 0))} /></label>
        <label className="f">{labels.children}<input type="number" name="children" min={0} max={maxSeats} value={children} onChange={(e) => setChildren(Math.max(0, +e.target.value || 0))} /></label>
      </div>
      {s && (s.left < adults + children
        ? <div className="notice bad">{labels.seatsLeft.replace('{0}', String(s.left))}</div>
        : <div className="notice ok stack" style={{ gap: 2 }}>
            <span className="row between"><span>{fmt(s.adult, lang)} × {adults}{children ? ` + ${fmt(s.child ?? s.adult, lang)} × ${children} (${labels.childPrice})` : ''}</span><b className="num">{fmt(total, lang)}</b></span>
            {s.meeting && <span className="small">📍 {s.meeting}</span>}
          </div>)}
      {state?.error && <div className="notice bad" role="alert">{state.error}</div>}
      <button className="btn sun" type="submit" disabled={pending || !s || s.left < adults + children || adults + children < 1}>{labels.addCart}</button>
      <p className="small muted">{labels.cancelPolicy}</p>
    </form>
  );
}
