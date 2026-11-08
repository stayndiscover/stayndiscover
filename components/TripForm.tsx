'use client';
import { useActionState, useState } from 'react';
import { createTrip, type FormState } from '@/app/actions';

type Opt = { slug: string; name: string };
type Acc = { id: string; dest: string; name: string };

export function TripForm({ lang, dests, accs, l, initialDest, defaults }: {
  lang: string; dests: Opt[]; accs: Acc[]; l: Record<string, string>; initialDest: string; defaults: { start: string; end: string };
}) {
  const [s, action, pending] = useActionState<FormState, FormData>(createTrip, null);
  const [dest, setDest] = useState(initialDest || dests[0]?.slug || '');
  const options = accs.filter((a) => a.dest === dest);
  return (
    <form className="panel stack" action={action} id="nouveau">
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={`/${lang}/sejour`} />
      <h2 style={{ fontSize: '1.3rem' }}>{l.newStay}</h2>
      <div className="form">
        <label className="f">{l.destination}<select name="destination" value={dest} onChange={(e) => setDest(e.target.value)} required>
          {dests.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select></label>
        <label className="f">{l.arrival}<input type="date" name="start_date" defaultValue={defaults.start} required /></label>
        <label className="f">{l.departure}<input type="date" name="end_date" defaultValue={defaults.end} required /></label>
        <label className="f">{l.arrTime}<input type="time" name="arrival_time" /></label>
        <label className="f">{l.depTime}<input type="time" name="departure_time" /></label>
        <label className="f">{l.adults}<input type="number" name="adults" min={1} max={30} defaultValue={2} /></label>
        <label className="f">{l.children}<input type="number" name="children" min={0} max={30} defaultValue={0} /></label>
        <label className="f">{l.accom}<select name="accommodation_id" defaultValue="">
          <option value="">{l.noAccomYet}</option>{options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="f">{l.actFrom}<input type="time" name="activity_start" defaultValue="09:00" /></label>
        <label className="f">{l.actTo}<input type="time" name="activity_end" defaultValue="19:00" /></label>
        <label className="f">{l.pace}<select name="pace" defaultValue="balanced">
          <option value="calm">{l.paceCalm}</option><option value="balanced">{l.paceEq}</option><option value="intense">{l.paceInt}</option></select></label>
        <label className="f">{l.budget}<input type="number" name="budget" min={0} step={50} /></label>
        <label className="f full">{l.prefs}<textarea name="preferences" placeholder={l.prefsPh} /></label>
      </div>
      {s?.error && <div className="notice bad" role="alert">{s.error}</div>}
      <div className="row"><button className="btn sun" disabled={pending}>{l.createStay}</button><span className="small muted">{l.createStayHint}</span></div>
    </form>
  );
}
