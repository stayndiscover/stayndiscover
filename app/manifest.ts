import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'StayNdiscover', short_name: 'StayNdiscover', start_url: '/', display: 'standalone',
    background_color: '#f4f6f5', theme_color: '#0b6e63', lang: 'fr',
    description: 'Hébergements, excursions et séjours en Martinique, au Belize et au Maroc.',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
