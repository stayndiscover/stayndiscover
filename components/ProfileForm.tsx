'use client';
import { useActionState } from 'react';
import { updateProfile, type FormState } from '@/app/actions';

export function ProfileForm({ lang, me, l }: { lang: string; me: { full_name: string | null; phone: string | null; email: string; preferred_lang: string }; l: Record<string, string> }) {
  const [s, action, pending] = useActionState<FormState, FormData>(updateProfile, null);
  return (
    <form className="panel stack" action={action}>
      <input type="hidden" name="lang" value={lang} />
      <h2 style={{ fontSize: '1.3rem' }}>{l.myProfile}</h2>
      <div className="form">
        <label className="f">{l.fullName}<input type="text" name="full_name" defaultValue={me.full_name ?? ''} autoComplete="name" /></label>
        <label className="f">{l.email}<input type="email" value={me.email} disabled /></label>
        <label className="f">{l.phone}<input type="tel" name="phone" defaultValue={me.phone ?? ''} autoComplete="tel" /></label>
        <label className="f">{l.prefLang}<select name="preferred_lang" defaultValue={me.preferred_lang}>
          <option value="fr">Français</option><option value="en">English</option><option value="es">Español</option></select></label>
        <label className="f" id="mot-de-passe">{l.newPass}<input type="password" name="password" minLength={8} autoComplete="new-password" placeholder={l.pwdHint} /></label>
      </div>
      {s?.error && <div className="notice bad" role="alert">{s.error}</div>}
      {s?.ok && <div className="notice ok" role="status">{s.ok}</div>}
      <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={pending}>{l.save}</button>
    </form>
  );
}
