import type { NextConfig } from 'next';

const config: NextConfig = {
  // Los paquetes internos se publican como TypeScript fuente.
  transpilePackages: [
    '@omnia/core', '@omnia/db', '@omnia/auth', '@omnia/inventory', '@omnia/organizations', '@omnia/parties',
    '@omnia/purchasing', '@omnia/sales', '@omnia/invoicing', '@omnia/hr', '@omnia/incidents',
  ],
  serverExternalPackages: ['postgres', '@react-pdf/renderer'],
  devIndicators: false,
  // Fotos y PDF de albaranes (las fotos se reducen en el navegador; los PDF no).
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
};

export default config;
