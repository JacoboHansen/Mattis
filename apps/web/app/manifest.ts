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
        src: '/icons/mattis-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  };
}
