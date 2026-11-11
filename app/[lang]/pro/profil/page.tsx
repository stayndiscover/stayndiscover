import { BackShell, statusPill } from '@/components/back/BackShell';
import { ProviderForm } from '@/components/back/ProviderForm';
import { ProfileForm } from '@/components/ProfileForm';
import { requireProvider, myProvider } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';
import { withDb, rows } from '@/lib/db';
import type { I18n } from '@/lib/i18n';

export const generateMetadata = backMeta('/pro/profil', 'bo_proProfile');

export default async function ProProfile(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const path = `/${lang}/pro/profil`;
  const me = await requireProvider(lang, path);
  const [p, dests] = await Promise.all([myProvider(me), withDb(me.id, (db) => rows<{ id: string; name: I18n }>(db, `select id, name from public.destinations where is_active order by sort_order`))]);
  return (
    <BackShell lang={lang} area="pro" active="profil" sp={sp}>
      <div className="row between"><h1 style={{ fontSize: '2rem' }}>{t('bo_proProfile')}</h1>{p && <span className={`pill ${statusPill(p.status)}`}>{t(`pst_${p.status}`)}</span>}</div>
      {!p && <p className="notice">{t('pro_needProfile')}</p>}
      <ProviderForm lang={lang} path={path} p={p} dests={dests} admin={false} />
      <ProfileForm lang={lang} me={me} l={{ myProfile: t('myProfile'), fullName: t('fullName'), email: t('email'), phone: t('phone'),
        prefLang: t('prefLang'), newPass: t('newPass'), pwdHint: t('pwdHint'), save: t('save') }} />
    </BackShell>
  );
}
