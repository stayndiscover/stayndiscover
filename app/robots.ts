import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Les pages personnelles (compte, panier…) portent une balise « noindex » : elles restent accessibles
// aux robots pour qu'ils la lisent, mais n'apparaissent jamais dans les résultats.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/auth/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
