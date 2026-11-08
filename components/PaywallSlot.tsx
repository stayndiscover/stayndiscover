import { PlannerPaywall } from './PlannerPaywall';
import { getMe } from '@/lib/auth';
import { withDb, one } from '@/lib/db';
import { money, translator, type Lang } from '@/lib/i18n';

export type PlannerStatus = { unlocked: boolean; used: number; free_items: number; price: number; currency: string };

export async function plannerStatus(userId: string, trip: string) {
  return withDb(userId, (db) => one<{ s: PlannerStatus }>(db, 'select public.planner_status($1) as s', [trip])).then((r) => r?.s ?? null).catch(() => null);
}

/** Affiche la fenêtre de déblocage quand l'adresse contient ?offre=planificateur&sejour=… */
export async function PaywallSlot({ lang, basePath, sp }: { lang: Lang; basePath: string; sp: Record<string, string | undefined> }) {
  if (sp.offre !== 'planificateur' || !sp.sejour) return null;
  const me = await getMe();
  if (!me) return null;
  const st = await plannerStatus(me.id, sp.sejour);
  if (!st || st.unlocked) return null;
  const t = translator(lang);
  const keep = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !['offre', 'attente'].includes(k)) as [string, string][]);
  const closeHref = `${basePath}${keep.size ? '?' + keep : ''}`;
  const price = money(st.price, lang, st.currency);
  return (
    <PlannerPaywall lang={lang} trip={sp.sejour} path={closeHref} closeHref={closeHref} pending={sp.attente === '1'}
      l={{ title: t('pwTitle'), text: t('pwText', st.free_items), b1: t('pwB1'), b2: t('pwB2'), b3: t('pwB3'), keep: t('pwKeep'),
        once: t('pwOnce'), btn: t('pwBtn', price), later: t('pwLater'), pending: t('pwPending'), close: t('close'), price }} />
  );
}
