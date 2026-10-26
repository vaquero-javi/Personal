import type { MetadataRoute } from 'next';

// Instalable como app (escritorio y móvil). El modo sin conexión (service
// worker y cola de fichajes) está pendiente.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Omnia · Gestión empresarial',
    short_name: 'Omnia',
    description: 'ERP/CRM multiempresa: ventas, compras, almacén, facturación, RRHH e incidencias.',
    lang: 'es',
    start_url: '/',
    display: 'standalone',
    background_color: '#e8eaed',
    theme_color: '#16181d',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
