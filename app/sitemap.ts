import type { MetadataRoute } from 'next';
import { withDb, rows } from '@/lib/db';
import { LANGS } from '@/lib/i18n';
import { SITE_URL } from '@/lib/seo';

// Calculé à chaque visite des robots : les nouvelles fiches publiées y apparaissent tout de suite.
export const dynamic = 'force-dynamic';

type Entry = MetadataRoute.Sitemap[number];
const entry = (path: string, opts: Partial<Entry> = {}): Entry => ({
  url: `${SITE_URL}/fr${path}`,
  alternates: { languages: { ...Object.fromEntries(LANGS.map((l) => [l, `${SITE_URL}/${l}${path}`])), 'x-default': `${SITE_URL}/fr${path}` } },
  ...opts,
});

/** Plan du site pour Google : chaque page existe en FR, EN et ES (une entrée par langue). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { dests, listings, cats } = await withDb(null, async (db) => ({
    dests: await rows<{ slug: string; updated: string }>(db, `select d.slug, greatest(d.created_at, coalesce(max(l.updated_at), d.created_at)) as updated
      from public.destinations d left join public.listings l on l.destination_id = d.id and l.status = 'published'
      where d.is_active group by d.id order by d.sort_order`),
    listings: await rows<{ dest: string; slug: string; updated: string; cover: string | null }>(db, `select d.slug as dest, l.slug, l.updated_at as updated,
        (select m.storage_path from public.listing_media m where m.listing_id = l.id and m.kind = 'photo' order by m.sort_order limit 1) as cover
      from public.listings l join public.destinations d on d.id = l.destination_id where l.status = 'published' and d.is_active`),
    cats: await rows<{ type: string; slug: string }>(db, `select distinct l.type::text as type, c.slug from public.listings l
      join public.categories c on c.id = l.category_id where l.status = 'published'`),
  }));
  const now = new Date();
  const base: Entry[] = [
    entry('', { changeFrequency: 'daily', priority: 1, lastModified: now }),
    entry('/destinations', { changeFrequency: 'weekly', priority: 0.9 }),
    entry('/explorer', { changeFrequency: 'daily', priority: 0.8 }),
    ...['hebergement', 'excursion', 'lieu'].map((t) => entry(`/explorer?type=${t}`, { changeFrequency: 'daily', priority: 0.8 })),
    ...cats.map((c) => entry(`/explorer?type=${c.type}&sub=${c.slug}`, { changeFrequency: 'weekly', priority: 0.5 })),
    ...dests.map((d) => entry(`/destinations/${d.slug}`, { changeFrequency: 'daily', priority: 0.9, lastModified: new Date(d.updated),
      images: [`${SITE_URL}/images/${d.slug}.jpg`] })),
    ...dests.flatMap((d) => ['hebergement', 'excursion'].map((t) => entry(`/explorer?type=${t}&dest=${d.slug}`, { changeFrequency: 'daily', priority: 0.7 }))),
    ...listings.map((l) => entry(`/destinations/${l.dest}/${l.slug}`, { changeFrequency: 'weekly', priority: 0.7, lastModified: new Date(l.updated),
      images: l.cover && process.env.NEXT_PUBLIC_SUPABASE_URL ? [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-media/${l.cover}`] : undefined })),
    ...['cgv', 'mentions', 'confidentialite'].map((p) => entry(`/informations/${p}`, { changeFrequency: 'yearly', priority: 0.2 })),
  ];
  // une entrée par langue, chacune avec ses équivalents (hreflang)
  return base.flatMap((e) => LANGS.map((l) => ({ ...e, url: (e.alternates!.languages as Record<string, string>)[l] })));
}
