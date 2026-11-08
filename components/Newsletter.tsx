'use client';
import { useActionState } from 'react';
import { subscribeNewsletter, type FormState } from '@/app/actions';

export function Newsletter({ lang, label }: { lang: string; label: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(subscribeNewsletter, null);
  return (
    <form className="stack" action={action} style={{ flex: 1, maxWidth: 460, gap: 6 }}>
      <input type="hidden" name="lang" value={lang} />
      <div className="row">
        <label htmlFor="nl" className="sr-only">E-mail</label>
        <input type="email" id="nl" name="email" required placeholder="vous@exemple.com" style={{ flex: 1 }} />
        <button className="btn" type="submit" disabled={pending}>{label}</button>
      </div>
      {state?.ok && <p className="small" role="status" style={{ color: 'var(--ok)' }}>{state.ok}</p>}
      {state?.error && <p className="small" role="alert" style={{ color: 'var(--bad)' }}>{state.error}</p>}
    </form>
  );
}
