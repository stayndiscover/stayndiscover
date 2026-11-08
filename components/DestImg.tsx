import { art, palFor } from '@/lib/art';
import type { Destination } from '@/lib/catalog';
import { tr } from '@/lib/i18n';
import { storageUrl } from '@/lib/supabase';

// Photos livrées avec le site pour les 3 destinations de départ ; les suivantes utilisent la couverture
// envoyée depuis l'administration (Supabase Storage).
const LOCAL: Record<string, string> = { martinique: '/images/martinique.jpg', belize: '/images/belize.jpg', maroc: '/images/maroc.jpg' };

export const destImgUrl = (d: Pick<Destination, 'slug' | 'cover_path'>) =>
  d.cover_path ? storageUrl('listing-media', d.cover_path) : LOCAL[d.slug] ?? null;

export function DestImg({ d, eager = false }: { d: Destination; eager?: boolean }) {
  const url = destImgUrl(d);
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt={tr(d.name, 'fr')} loading={eager ? 'eager' : 'lazy'} />;
  return <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: art(palFor(d.slug, d.theme), 'plage', d.slug) }} />;
}
