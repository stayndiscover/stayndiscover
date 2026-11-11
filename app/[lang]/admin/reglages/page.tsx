import { BackShell } from '@/components/back/BackShell';
import { requireAdmin } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, rows } from '@/lib/db';
import { saveSettings } from '@/app/back-actions';

export const generateMetadata = backMeta('/admin/reglages', 'bo_settings');

/** Réglages : commissions (modifiables par l'admin, § 8 du cahier des charges), planificateur, paiement. */
export default async function AdminSettings(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const path = `/${lang}/admin/reglages`;
  const me = await requireAdmin(lang, path);
  const { rates, settings } = await withDb(me.id, async (db) => ({
    rates: await rows<{ type: string; rate: string }>(db, `select distinct on (type) type::text as type, rate::text from public.commission_rates
      where provider_id is null order by type, valid_from desc`),
    settings: Object.fromEntries((await rows<{ key: string; value: unknown }>(db, `select key, value from public.settings`)).map((s) => [s.key, s.value])),
  }));
  const rate = (ty: string) => { const r = rates.find((x) => x.type === ty); return r ? +(Number(r.rate) * 100).toFixed(2) : 12; };
  const st = (k: string, d: number) => (settings[k] === undefined ? d : Number(settings[k]));
  return (
    <BackShell lang={lang} area="admin" active="reglages" sp={sp}>
      <h1 style={{ fontSize: '2rem' }}>{t('bo_settings')}</h1>
      <form action={saveSettings} className="panel stack" style={{ gap: 16 }}>
        <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={path} />
        <h2 style={{ fontSize: '1.2rem' }}>{t('set_commission')}</h2>
        <div className="form">
          <label className="f">{t('k_stays')}<input type="number" step="0.1" min="0" max="50" name="rate_hebergement" defaultValue={rate('hebergement')} /></label>
          <label className="f">{t('k_tours')}<input type="number" step="0.1" min="0" max="50" name="rate_excursion" defaultValue={rate('excursion')} /></label>
        </div>
        <h2 style={{ fontSize: '1.2rem' }}>{t('set_planner')}</h2>
        <div className="form">
          <label className="f">{t('set_plannerPrice')}<input type="number" step="0.01" min="0" name="planner_price" defaultValue={st('planner_price', 19.99)} /></label>
          <label className="f">{t('set_plannerFree')}<input type="number" min="0" name="planner_free_items" defaultValue={st('planner_free_items', 5)} /></label>
        </div>
        <h2 style={{ fontSize: '1.2rem' }}>{t('bo_sales')}</h2>
        <div className="form">
          <label className="f">{t('set_hold')}<input type="number" min="10" max="120" name="hold_minutes" defaultValue={st('hold_minutes', 35)} /></label>
          <label className="f">{t('set_payoutDelay')}<input type="number" min="0" max="60" name="payout_delay_days" defaultValue={st('payout_delay_days', 1)} /></label>
        </div>
        <button className="btn" style={{ alignSelf: 'flex-start' }}>{t('bo_save')}</button>
      </form>
    </BackShell>
  );
}
