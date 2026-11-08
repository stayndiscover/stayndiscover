import { jsonLd } from '@/lib/seo';

/** Données structurées schema.org, intégrées dans la page pour Google, Bing et les assistants. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd({ '@context': 'https://schema.org', ...(data as object) })} />;
}
