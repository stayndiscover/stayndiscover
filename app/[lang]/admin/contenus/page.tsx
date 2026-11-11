import Link from 'next/link';
import { BackShell } from '@/components/back/BackShell';
import { requireAdmin } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, rows } from '@/lib/db';
import { saveContent } from '@/app/back-actions';

export const generateMetadata = backMeta('/admin/contenus', 'bo_content');

const KEYS: [string, string, string][] = [
  ['home.hero', 'cnt_hero', ''], ['page.cgv', 'cgv', 'cgv'], ['page.mentions', 'mentions', 'mentions'], ['page.confidentialite', 'privacy', 'confidentialite'],
];

/** Gestion des contenus (§ 5.G) : bandeau d'accueil et pages légales, en FR / EN / ES. */
export default async function AdminContent(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const path = `/${lang}/admin/contenus`;
  const me = await requireAdmin(lang, path);
  const all = await withDb(me.id, (db) => rows<{ key: string; value: Record<string, Record<string, string>>; is_published: boolean }>(db,
    `select key, value, is_published from public.site_content`));
  const get = (k: string) => all.find((x) => x.key === k);
  return (
    <BackShell lang={lang} area="admin" active="contenus" sp={sp}>
      <h1 style={{ fontSize: '2rem' }}>{t('bo_content')}</h1>
      {KEYS.map(([key, label, page]) => {
        const c = get(key);
        const hero = key === 'home.hero';
        const anchor = key.replace('.', '-');
        return (
          <form key={key} action={saveContent} className="panel stack" id={anchor} style={{ gap: 12 }}>
            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="path" value={path} />
            <input type="hidden" name="key" value={key} /><input type="hidden" name="anchor" value={anchor} />
            <div className="row between"><h2 style={{ fontSize: '1.2rem' }}>{hero ? t(label) : `${t('cnt_page')} · ${t(label)}`}</h2>
              <Link className="small" href={hero ? `/${lang}` : `/${lang}/informations/${page}`} target="_blank">{t('bo_view')} ↗</Link></div>
            {!hero && <p className="small muted">{t('cnt_pageHelp')}</p>}
            {(['fr', 'en', 'es'] as const).map((l) => (
              <fieldset key={l} className="stack" style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, gap: 8 }}>
                <legend className="lang-tag">{l.toUpperCase()}</legend>
                <label className="f">{t('cnt_heroTitle')}<input type="text" name={`title_${l}`} defaultValue={c?.value?.[l]?.title ?? ''} /></label>
                {hero ? <label className="f">{t('cnt_heroSub')}<textarea name={`subtitle_${l}`} rows={2} defaultValue={c?.value?.[l]?.subtitle ?? ''} /></label>
                  : <label className="f">{t('ed_desc')}<textarea name={`body_${l}`} rows={8} defaultValue={c?.value?.[l]?.body ?? ''} /></label>}
              </fieldset>
            ))}
            <label className="row small" style={{ gap: 8 }}><input type="checkbox" name="is_published" value="on" defaultChecked={c?.is_published ?? true} /> {t('cnt_published')}</label>
            <input type="hidden" name="is_published" value="off" />
            <button className="btn sm" style={{ alignSelf: 'flex-start' }}>{t('bo_save')}</button>
          </form>
        );
      })}
    </BackShell>
  );
}
