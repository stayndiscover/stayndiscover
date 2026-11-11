import { translator, tr, type I18n, type Lang } from '@/lib/i18n';
import { storageUrl } from '@/lib/supabase';
import { saveProvider } from '@/app/back-actions';
import type { Provider } from '@/lib/back';

/** Profil professionnel (cahier des charges § 4.C.1) — utilisé par le prestataire et par l'administration. */
export function ProviderForm({ lang, path, p, dests, admin }: { lang: Lang; path: string; p: Provider | null; dests: { id: string; name: I18n }[]; admin: boolean }) {
  const t = translator(lang);
  const d = (p?.description ?? {}) as Record<string, string>;
  return (
    <form action={saveProvider} className="panel stack" style={{ gap: 16 }}>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={path} />
      <input type="hidden" name="provider" value={p?.id ?? ''} />
      <h2 style={{ fontSize: '1.2rem' }}>{t('bo_proProfile')}</h2>
      <div className="form">
        <label className="f">{t('pro_trade')}<input type="text" name="trade_name" required defaultValue={p?.trade_name ?? ''} /></label>
        <label className="f">{t('bo_email')}<input type="email" name="email" defaultValue={p?.email ?? ''} /></label>
        <label className="f">{t('phone')}<input type="tel" name="phone" defaultValue={p?.phone ?? ''} /></label>
        <label className="f">{t('ed_address')}<input type="text" name="address" defaultValue={p?.address ?? ''} /></label>
        <label className="f">{t('pro_country')}<input type="text" name="country_code" maxLength={2} defaultValue={p?.country_code ?? 'FR'} /></label>
        <label className="f">{t('bo_dests').replace(/s$/, '')}<select name="destination_id" defaultValue={p?.destination_id ?? ''}>
          <option value="">—</option>{dests.map((x) => <option key={x.id} value={x.id}>{tr(x.name, lang)}</option>)}</select></label>
        <label className="f">{t('pro_logo')}<input type="file" name="logo" accept="image/jpeg,image/png,image/webp,image/svg+xml" /></label>
        {p?.logo_path && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={storageUrl('avatars', p.logo_path)} alt="" style={{ height: 56, width: 'auto', alignSelf: 'end', borderRadius: 8 }} />
        )}
      </div>
      <div className="i18n-field">
        <span className="lbl">{t('pro_desc')}</span>
        {(['fr', 'en', 'es'] as const).map((l) => (
          <label key={l} className="f i18n-line"><span className="lang-tag">{l.toUpperCase()}</span><textarea name={`pdesc_${l}`} rows={3} defaultValue={d[l] ?? ''} /></label>
        ))}
      </div>
      <label className="f">{t('pro_legal')}<textarea name="legal" rows={2} defaultValue={p?.legal_info?.info ?? ''} /></label>
      <label className="f">{t('pro_bank')}<textarea name="bank" rows={2} defaultValue={p?.manual_payout_details?.details ?? ''} /></label>
      {admin && p ? (
        <label className="f">{t('pro_payMethod')}<select name="payout_method" defaultValue={p.payout_method}>
          <option value="stripe_connect">{t('pm_stripe_connect')}</option><option value="manual_transfer">{t('pm_manual_transfer')}</option></select></label>
      ) : <p className="small muted">{t('pro_payMethod')} : {t(`pm_${p?.payout_method ?? 'stripe_connect'}`)}. {t('pro_stripeLater')}</p>}
      <button className="btn" style={{ alignSelf: 'flex-start' }}>{t('bo_save')}</button>
    </form>
  );
}
