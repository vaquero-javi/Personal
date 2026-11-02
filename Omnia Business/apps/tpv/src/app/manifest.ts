import type { MetadataRoute } from 'next';

// Instalable en la tablet como app a pantalla completa.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Omnia TPV',
    short_name: 'TPV',
    start_url: '/',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: '#e8eaed',
    theme_color: '#16181d',
    icons: [{ src: '/brand/logo.png', sizes: '256x256', type: 'image/png' }],
  };
}
