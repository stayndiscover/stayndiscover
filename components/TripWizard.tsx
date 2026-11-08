'use client';
import { useActionState, useMemo, useState } from 'react';
import { saveTrip, type FormState } from '@/app/actions';
import { translator, type Lang } from '@/lib/i18n';
import { PREFS } from '@/lib/dict-planner';

export type TripInitial = {
  id?: string; destination: string; title: string; regions: string; start_date: string; end_date: string; arrival_time: string;
  departure_time: string; transport_info: string; accommodation_mode: string; accommodation_id: string; ext_acc_name: string;
  ext_acc_address: string; ext_gps: string; ext_check_in: string; ext_check_out: string; adults: number; children: number;
  children_ages: number[]; prefs: string[]; pace: string; activity_start: string; activity_end: string; free_time_min: number;
  weekdays: number[]; budget: string; budget_scope: string;
};
type Dest = { slug: string; name: string; img: string | null };
type Acc = { id: string; dest: string; name: string };

const STEPS = ['stDest', 'stDates', 'stAcc', 'stTravellers', 'stPrefs', 'stPace', 'stRecap'] as const;
const GPS = /^\s*-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?\s*$/;
const nightsBetween = (a: string, b: string) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) : 0);

/** Questionnaire de création (ou de modification) du séjour, en 7 étapes. Rien n'est perdu entre les étapes. */
export function TripWizard({ lang, initial, dests, accs }: { lang: Lang; initial: TripInitial; dests: Dest[]; accs: Acc[] }) {
  const t = translator(lang);
  const [state, action, pending] = useActionState<FormState, FormData>(saveTrip, null);
  const [step, setStep] = useState(0);
  const [v, setV] = useState(initial);
  const [err, setErr] = useState('');
  const set = <K extends keyof TripInitial>(k: K, val: TripInitial[K]) => setV((o) => ({ ...o, [k]: val }));
  const nights = nightsBetween(v.start_date, v.end_date);
  const destAccs = useMemo(() => accs.filter((a) => a.dest === v.destination), [accs, v.destination]);
  const destName = dests.find((d) => d.slug === v.destination)?.name ?? '';
  const fmtD = (d: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const weekdayNames = Array.from({ length: 7 }, (_, k) => new Date(2024, 0, 7 + k).toLocaleDateString(lang, { weekday: 'short' }));

  const check = (s: number): string => {
    if (s === 0 && !v.destination) return t('errRequired');
    if (s === 1 && (!v.start_date || !v.end_date || v.end_date <= v.start_date)) return t('errDates');
    if (s === 2 && v.accommodation_mode === 'staynd' && !v.accommodation_id) return t('errRequired');
    if (s === 2 && v.accommodation_mode === 'elsewhere' && (!v.ext_acc_name.trim() || !v.ext_acc_address.trim())) return t('errRequired');
    if (s === 2 && v.accommodation_mode === 'elsewhere' && v.ext_gps && !GPS.test(v.ext_gps)) return t('errGps');
    if (s === 3 && v.adults < 1) return t('errRequired');
    return '';
  };
  const go = (to: number) => {
    if (to > step) { const e = check(step); if (e) { setErr(e); return; } }
    setErr(''); setStep(to); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const setChildren = (n: number) => setV((o) => ({ ...o, children: n, children_ages: Array.from({ length: n }, (_, i) => o.children_ages[i] ?? 8) }));
  const toggle = <T,>(arr: T[], x: T) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);
  const pane = (i: number) => ({ hidden: step !== i, className: 'stack wz-pane', role: 'group', 'aria-labelledby': `wz-h-${i}` });

  return (
    <form action={action} className="panel stack wizard" noValidate onKeyDown={(e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && step < STEPS.length - 1) { e.preventDefault(); go(step + 1); }
    }}>
      <input type="hidden" name="lang" value={lang} />
      {initial.id && <input type="hidden" name="trip" value={initial.id} />}

      <ol className="wz-steps" aria-label={t('stepOf', step + 1, STEPS.length)}>
        {STEPS.map((k, i) => (
          <li key={k} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <button type="button" onClick={() => (i < step ? go(i) : undefined)} disabled={i > step} aria-current={i === step ? 'step' : undefined}>
              <span className="n">{i < step ? '✓' : i + 1}</span><span className="l">{t(k)}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="small muted">{t('stepOf', step + 1, STEPS.length)}</p>

      {/* 1. Destination */}
      <div {...pane(0)}>
        <h2 id="wz-h-0">{t('stDest')}</h2>
        <div className="wz-dests" role="radiogroup" aria-label={t('stDest')}>
          {dests.map((d) => (
            <label key={d.slug} className={`wz-dest ${v.destination === d.slug ? 'on' : ''}`}>
              <input type="radio" name="destination" value={d.slug} checked={v.destination === d.slug} onChange={() => set('destination', d.slug)} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {d.img && <img src={d.img} alt="" />}
              <span>{d.name}</span>
            </label>
          ))}
        </div>
        <div className="form">
          <label className="f">{t('tripName')}<input type="text" name="title" maxLength={120} value={v.title} placeholder={t('tripNamePh')} onChange={(e) => set('title', e.target.value)} /></label>
          <label className="f">{t('regions')}<input type="text" name="regions" maxLength={300} value={v.regions} placeholder={t('regionsPh')} onChange={(e) => set('regions', e.target.value)} /></label>
        </div>
      </div>

      {/* 2. Dates */}
      <div {...pane(1)}>
        <h2 id="wz-h-1">{t('stDates')}</h2>
        <div className="form">
          <label className="f">{t('arrival')} *<input type="date" name="start_date" value={v.start_date} onChange={(e) => set('start_date', e.target.value)} /></label>
          <label className="f">{t('departure')} *<input type="date" name="end_date" min={v.start_date || undefined} value={v.end_date} onChange={(e) => set('end_date', e.target.value)} /></label>
          <label className="f">{t('arrTime')}<input type="time" name="arrival_time" value={v.arrival_time} onChange={(e) => set('arrival_time', e.target.value)} /></label>
          <label className="f">{t('depTime')}<input type="time" name="departure_time" value={v.departure_time} onChange={(e) => set('departure_time', e.target.value)} /></label>
          <label className="f full">{t('transport')}<textarea name="transport_info" maxLength={1000} value={v.transport_info} placeholder={t('transportPh')} onChange={(e) => set('transport_info', e.target.value)} /></label>
        </div>
        {nights > 0 && <div className="notice ok" aria-live="polite">{t('nightsN', nights, nights + 1)}</div>}
      </div>

      {/* 3. Hébergement */}
      <div {...pane(2)}>
        <h2 id="wz-h-2">{t('accQ')}</h2>
        <div className="radio-row wz-col" role="radiogroup">
          {(['staynd', 'elsewhere', 'find', 'undecided'] as const).map((m) => (
            <label key={m}><input type="radio" name="accommodation_mode" value={m} checked={v.accommodation_mode === m} onChange={() => set('accommodation_mode', m)} />
              {t({ staynd: 'accStaynd', elsewhere: 'accElsewhere', find: 'accFind', undecided: 'accUndecided' }[m])}</label>
          ))}
        </div>
        {v.accommodation_mode === 'staynd' && (
          <label className="f">{t('accPick')}<select name="accommodation_id" value={v.accommodation_id} onChange={(e) => set('accommodation_id', e.target.value)}>
            <option value="">—</option>{destAccs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        )}
        {v.accommodation_mode === 'elsewhere' && (
          <div className="form">
            <label className="f">{t('accName')} *<input type="text" name="ext_acc_name" maxLength={200} value={v.ext_acc_name} onChange={(e) => set('ext_acc_name', e.target.value)} /></label>
            <label className="f">{t('accAddress')} *<input type="text" name="ext_acc_address" maxLength={500} value={v.ext_acc_address} onChange={(e) => set('ext_acc_address', e.target.value)} /></label>
            <label className="f">{t('accGps')}<input type="text" name="ext_gps" inputMode="decimal" value={v.ext_gps} placeholder="14.4432, -60.8857" onChange={(e) => set('ext_gps', e.target.value)} />
              <span className="small muted">{t('accGpsHelp')}</span></label>
            <label className="f">{t('checkIn')}<input type="time" name="ext_check_in" value={v.ext_check_in} onChange={(e) => set('ext_check_in', e.target.value)} /></label>
            <label className="f">{t('checkOut')}<input type="time" name="ext_check_out" value={v.ext_check_out} onChange={(e) => set('ext_check_out', e.target.value)} /></label>
          </div>
        )}
        {v.accommodation_mode === 'find' && <div className="notice info">{t('accFindNote')}</div>}
      </div>

      {/* 4. Voyageurs */}
      <div {...pane(3)}>
        <h2 id="wz-h-3">{t('stTravellers')}</h2>
        <div className="form">
          <label className="f">{t('adults')} *<input type="number" name="adults" min={1} max={30} value={v.adults} onChange={(e) => set('adults', Math.max(1, Math.min(30, +e.target.value || 1)))} /></label>
          <label className="f">{t('children')}<input type="number" name="children" min={0} max={30} value={v.children} onChange={(e) => setChildren(Math.max(0, Math.min(30, +e.target.value || 0)))} /></label>
          {v.children_ages.map((a, i) => (
            <label key={i} className="f">{t('childAge', i + 1)}<select name="child_age" value={a} onChange={(e) => set('children_ages', v.children_ages.map((x, j) => (j === i ? +e.target.value : x)))}>
              {Array.from({ length: 18 }, (_, y) => <option key={y} value={y}>{t('years', y)}</option>)}</select></label>
          ))}
        </div>
        <p className="small muted">{t('totalTravellers', v.adults + v.children)}</p>
      </div>

      {/* 5. Envies */}
      <div {...pane(4)}>
        <h2 id="wz-h-4">{t('prefsQ')}</h2>
        <div className="chips">
          {PREFS.map((p) => (
            <label key={p.key} className={`chip ${v.prefs.includes(p.key) ? 'on' : ''}`}>
              <input type="checkbox" name="prefs" value={p.key} className="sr-only" checked={v.prefs.includes(p.key)} onChange={() => set('prefs', toggle(v.prefs, p.key))} />
              {p.label[{ fr: 0, en: 1, es: 2 }[lang]]}
            </label>
          ))}
        </div>
      </div>

      {/* 6. Rythme et budget */}
      <div {...pane(5)}>
        <h2 id="wz-h-5">{t('paceQ')}</h2>
        <div className="wz-paces" role="radiogroup">
          {([['calm', 'paceCalm', 'paceCalmD'], ['balanced', 'paceEq', 'paceEqD'], ['intense', 'paceInt', 'paceIntD']] as const).map(([val, l, d]) => (
            <label key={val} className={`wz-pace ${v.pace === val ? 'on' : ''}`}>
              <input type="radio" name="pace" value={val} checked={v.pace === val} onChange={() => set('pace', val)} />
              <b>{t(l)}</b><span className="small muted">{t(d)}</span>
            </label>
          ))}
        </div>
        <div className="form">
          <label className="f">{t('actFrom')}<input type="time" name="activity_start" value={v.activity_start} onChange={(e) => set('activity_start', e.target.value)} /></label>
          <label className="f">{t('actTo')}<input type="time" name="activity_end" value={v.activity_end} onChange={(e) => set('activity_end', e.target.value)} /></label>
          <label className="f">{t('freeTime')}<select name="free_time_min" value={v.free_time_min} onChange={(e) => set('free_time_min', +e.target.value)}>
            {[0, 30, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m === 0 ? t('noneMin') : m < 60 ? `${m} min` : `${m / 60} h`}</option>)}</select></label>
          <label className="f">{t('budget')}<input type="number" name="budget" min={0} step={50} value={v.budget} onChange={(e) => set('budget', e.target.value)} /></label>
          <label className="f">{t('budgetScope')}<select name="budget_scope" value={v.budget_scope} onChange={(e) => set('budget_scope', e.target.value)}>
            <option value="group">{t('budgetGroup')}</option><option value="person">{t('budgetPerson')}</option></select></label>
        </div>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
          <legend className="small muted" style={{ fontWeight: 600 }}>{t('activeDays')}</legend>
          <div className="chips">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <label key={d} className={`chip ${v.weekdays.includes(d) ? 'on' : ''}`}>
                <input type="checkbox" name="weekdays" value={d} className="sr-only" checked={v.weekdays.includes(d)} onChange={() => set('weekdays', toggle(v.weekdays, d))} />
                {weekdayNames[d]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {/* 7. Récapitulatif */}
      <div {...pane(6)}>
        <h2 id="wz-h-6">{t('stRecap')}</h2>
        <div className="facts">
          <div className="fact"><div className="k">{t('stDest')}</div><div className="v">{destName}{v.regions && ` · ${v.regions}`}</div></div>
          <div className="fact"><div className="k">{t('stDates')}</div><div className="v">{fmtD(v.start_date)} → {fmtD(v.end_date)} · {t('nightsN', nights, nights + 1)}</div></div>
          <div className="fact"><div className="k">{t('stAcc')}</div><div className="v">{
            v.accommodation_mode === 'staynd' ? accs.find((a) => a.id === v.accommodation_id)?.name
              : v.accommodation_mode === 'elsewhere' ? v.ext_acc_name : t(v.accommodation_mode === 'find' ? 'accFind' : 'accUndecided')}</div></div>
          <div className="fact"><div className="k">{t('stTravellers')}</div><div className="v">{t('totalTravellers', v.adults + v.children)}</div></div>
          <div className="fact"><div className="k">{t('stPrefs')}</div><div className="v">{v.prefs.length ? PREFS.filter((p) => v.prefs.includes(p.key)).map((p) => p.label[{ fr: 0, en: 1, es: 2 }[lang]]).join(', ') : t('notSet')}</div></div>
          <div className="fact"><div className="k">{t('paceQ')}</div><div className="v">{t({ calm: 'paceCalm', balanced: 'paceEq', intense: 'paceInt' }[v.pace] ?? 'paceEq')} · {v.activity_start}–{v.activity_end}</div></div>
        </div>
      </div>

      {(err || state?.error) && <div className="notice bad" role="alert">{err || state?.error}</div>}
      <div className="row between">
        {step > 0 ? <button type="button" className="btn ghost" onClick={() => go(step - 1)}>← {t('prev')}</button> : <span />}
        {step < STEPS.length - 1
          // clés distinctes : sinon le navigateur réutilise le bouton « Suivant » devenu « submit » et envoie le formulaire trop tôt
          ? <button key="next" type="button" className="btn" onClick={() => go(step + 1)}>{t('next')} →</button>
          : <button key="submit" type="submit" className="btn sun" disabled={pending} onClick={(e) => {
              for (let s = 0; s < STEPS.length - 1; s++) { const m = check(s); if (m) { e.preventDefault(); setErr(m); setStep(s); return; } }
            }}>{initial.id ? t('saveTrip') : t('validateTrip')}</button>}
      </div>
    </form>
  );
}
