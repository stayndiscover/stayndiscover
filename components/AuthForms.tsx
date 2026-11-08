'use client';
import { useActionState } from 'react';
import { resetPassword, signIn, signUp, type FormState } from '@/app/actions';

type L = Record<string, string>;
const Msg = ({ s }: { s: FormState }) => (s?.error ? <div className="notice bad" role="alert">{s.error}</div>
  : s?.ok ? <div className="notice ok" role="status">{s.ok}</div> : null);

export function LoginForm({ lang, next, l }: { lang: string; next: string; l: L }) {
  const [s, action, pending] = useActionState<FormState, FormData>(signIn, null);
  return (
    <form className="stack" action={action}>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="next" value={next} />
      <label className="f">{l.email}<input type="email" name="email" required autoComplete="email" defaultValue={s?.values?.email} /></label>
      <label className="f">{l.password}<input type="password" name="password" required autoComplete="current-password" /></label>
      <Msg s={s} />
      <button className="btn" disabled={pending}>{l.login}</button>
    </form>
  );
}

export function SignupForm({ lang, next, l, type }: { lang: string; next: string; l: L; type: string }) {
  const [s, action, pending] = useActionState<FormState, FormData>(signUp, null);
  if (s?.ok) return <Msg s={s} />;
  return (
    <form className="stack" action={action}>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="next" value={next} />
      <label className="f">{l.fullName}<input type="text" name="full_name" required autoComplete="name" defaultValue={s?.values?.full_name} /></label>
      <label className="f">{l.email}<input type="email" name="email" required autoComplete="email" defaultValue={s?.values?.email} /></label>
      <label className="f">{l.password} <span className="small">({l.pwdHint})</span><input type="password" name="password" required minLength={8} autoComplete="new-password" /></label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        <legend className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>{l.accountType}</legend>
        <div className="radio-row">
          <label><input type="radio" name="account_type" value="client" defaultChecked={(s?.values?.account_type || type) !== 'provider'} /> {l.accTraveller}</label>
          <label><input type="radio" name="account_type" value="provider" defaultChecked={(s?.values?.account_type || type) === 'provider'} /> {l.accProvider}</label>
        </div>
      </fieldset>
      <Msg s={s} />
      <button className="btn" disabled={pending}>{l.signup}</button>
    </form>
  );
}

export function ResetForm({ lang, l }: { lang: string; l: L }) {
  const [s, action, pending] = useActionState<FormState, FormData>(resetPassword, null);
  return (
    <form className="stack" action={action}>
      <input type="hidden" name="lang" value={lang} />
      <label className="f">{l.email}<input type="email" name="email" required autoComplete="email" /></label>
      <Msg s={s} />
      <button className="btn ghost" disabled={pending}>{l.send}</button>
    </form>
  );
}
