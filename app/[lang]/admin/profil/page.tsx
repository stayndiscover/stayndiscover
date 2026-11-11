import { BackShell } from '@/components/back/BackShell';
import { ProfileForm } from '@/components/ProfileForm';
import { requireAdmin } from '@/lib/back';
import { pageArgs, backMeta, type PageProps } from '@/lib/back-page';

export const generateMetadata = backMeta('/admin/profil', 'myProfile');

/** Profil de l'administrateur (nom, e-mail, mot de passe), sans passer par l'espace visiteur. */
export default async function AdminProfile(props: PageProps) {
  const { lang, sp, t } = await pageArgs(props);
  const me = await requireAdmin(lang, `/${lang}/admin/profil`);
  return (
    <BackShell lang={lang} area="admin" active="profil" sp={sp}>
      <h1 style={{ fontSize: '2rem' }}>{t('myProfile')}</h1>
      <ProfileForm lang={lang} me={me} l={{ myProfile: t('myProfile'), fullName: t('fullName'), email: t('email'), phone: t('phone'),
        prefLang: t('prefLang'), newPass: t('newPass'), pwdHint: t('pwdHint'), save: t('save') }} />
    </BackShell>
  );
}
