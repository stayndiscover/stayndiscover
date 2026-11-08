import Image from 'next/image';
import { art, palFor } from '@/lib/art';
import type { Destination } from '@/lib/catalog';
import { tr, type Lang } from '@/lib/i18n';
import { storageUrl } from '@/lib/supabase';

// Photos livrées avec le site pour les 3 destinations de départ ; les suivantes utilisent la couverture
// envoyée depuis l'administration (Supabase Storage).
const LOCAL: Record<string, string> = { martinique: '/images/martinique.jpg', belize: '/images/belize.jpg', maroc: '/images/maroc.jpg' };

export const destImgUrl = (d: Pick<Destination, 'slug' | 'cover_path'>) =>
  d.cover_path ? storageUrl('listing-media', d.cover_path) : LOCAL[d.slug] ?? null;

/** Photo de destination, servie en WebP/AVIF à la bonne taille pour chaque écran (chargement plus rapide). */
export function DestImg({ d, eager = false, lang = 'fr', sizes = '(max-width: 820px) 100vw, 33vw' }: { d: Destination; eager?: boolean; lang?: Lang; sizes?: string }) {
  const url = destImgUrl(d);
  if (url) return <Image src={url} alt={tr(d.name, lang)} fill sizes={sizes} priority={eager} quality={70} />;
  return <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: art(palFor(d.slug, d.theme), 'plage', d.slug) }} />;
}
