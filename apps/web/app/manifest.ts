import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mattis',
    short_name: 'Mattis',
    description: 'En roligere måte å få grep om matten på.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fff9f2',
    theme_color: '#fff9f2',
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/mattis-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/mattis-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
