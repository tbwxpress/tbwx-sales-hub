import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TBWX Sales Hub',
    short_name: 'TBWX',
    description: 'Sales dashboard for The Belgian Waffle Xpress',
    start_url: '/today',
    display: 'standalone',
    background_color: '#1a1209',
    theme_color: '#1a1209',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
