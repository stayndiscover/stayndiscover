import { BackShell, ActionForm } from '@/components/back/BackShell';
import { requireAdmin } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, rows } from '@/lib/db';
import { type I18n } from '@/lib/i18n';
import { saveCategory, deleteCategory } from '@/app/back-actions';

export const generateMetadata = backMeta('/admin/categories', 'bo_cats');

/** Gestion des catégories (§ 5.D) : Hébergement et Excursion en principal, sous-catégories pour le reste. */
export default async function AdminCats(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const path = `/${lang}/admin/categories`;
  const me = await requireAdmin(lang, path);
  const cats = await withDb(me.id, (db) => rows<{ id: string; slug: string; type: string; parent_id: string | null; name: I18n; sort_order: number; n: number }>(db,
    `select c.id, c.slug, c.type::text as type, c.parent_id, c.name, c.sort_order, (select count(*)::int from public.listings l where l.category_id = c.id) as n
       from public.categories c order by c.type, c.parent_id nulls first, c.sort_order, c.slug`));
  const groups: [string, string][] = [['hebergement', 'bo_typeHeb'], ['excursion', 'bo_typeExc'], ['lieu', 'bo_typeLieu']];
  return (
    <BackShell lang={lang} area="admin" active="categories" sp={sp}>
      <h1 style={{ fontSize: '2rem' }}>{t('bo_cats')}</h1>
      <p className="notice info">{t('cat_rule')}</p>
      {groups.map(([type, label]) => (
        <section key={type} className="panel stack" id={`c-${type}`}>
          <h2 style={{ fontSize: '1.2rem' }}>{t(label)}</h2>
          <div className="tablewrap"><table className="back-table"><thead><tr><th>FR</th><th>EN</th><th>ES</th><th>{t('dst_order')}</th><th>{t('bo_listings')}</th><th /></tr></thead>
            <tbody>{cats.filter((c) => c.type === type).map((c) => {
              const nm = c.name as Record<string, string>;
              const fid = `cat-${c.id}`;
              return (
                <tr key={c.id}>
                  <td><input form={fid} type="text" name="cname_fr" defaultValue={nm.fr ?? ''} required aria-label="FR" />{!c.parent_id && type !== 'lieu' && <span className="pill" style={{ marginTop: 4 }}>{t('cat_main')}</span>}</td>
                  <td><input form={fid} type="text" name="cname_en" defaultValue={nm.en ?? ''} aria-label="EN" /></td>
                  <td><input form={fid} type="text" name="cname_es" defaultValue={nm.es ?? ''} aria-label="ES" /></td>
                  <td style={{ width: 90 }}><input form={fid} type="number" name="sort_order" defaultValue={c.sort_order} aria-label={t('dst_order')} /></td>
                  <td className="small num">{c.n}</td>
                  <td><div className="row" style={{ gap: 6 }}>
                    <ActionForm id={fid} action={saveCategory} lang={lang} path={path} fields={{ cat: c.id }} anchor={`c-${type}`}><button className="btn sm">{t('bo_save')}</button></ActionForm>
                    {!c.parent_id && type !== 'lieu' ? null : (
                      <ActionForm action={deleteCategory} lang={lang} path={path} fields={{ cat: c.id }} anchor={`c-${type}`} className="inline-form">
                        {c.n > 0 && (
                          <select name="move_to" required aria-label={t('cat_moveTo')} style={{ width: 200 }} defaultValue="">
                            <option value="" disabled>{t('cat_moveTo')}</option>
                            {cats.filter((o) => o.type === type && o.id !== c.id && (o.parent_id || type === 'lieu')).map((o) => (
                              <option key={o.id} value={o.id}>{(o.name as Record<string, string>)[lang] ?? (o.name as Record<string, string>).fr}</option>))}
                          </select>
                        )}
                        <button className="btn ghost sm">{t('bo_delete')}</button>
                      </ActionForm>
                    )}
                  </div></td>
                </tr>);
            })}</tbody></table></div>
          <ActionForm action={saveCategory} lang={lang} path={path} fields={{ type }} anchor={`c-${type}`} className="row">
            <span className="small"><b>+ {t('cat_new')}</b></span>
            <input type="text" name="cname_fr" placeholder="FR" required aria-label="FR" style={{ maxWidth: 180 }} />
            <input type="text" name="cname_en" placeholder="EN" aria-label="EN" style={{ maxWidth: 180 }} />
            <input type="text" name="cname_es" placeholder="ES" aria-label="ES" style={{ maxWidth: 180 }} />
            <button className="btn sm">{t('bo_add')}</button>
          </ActionForm>
        </section>
      ))}
    </BackShell>
  );
}
