import type { NextConfig } from 'next';

/**
 * Panel del equipo de Omnia: app aparte de la web de las sociedades, con su
 * propio dominio, su propia cookie y su propio inicio de sesión (email +
 * contraseña del equipo, no las cuentas de las sociedades).
 */
const config: NextConfig = {
  transpilePackages: ['@omnia/core', '@omnia/db', '@omnia/organizations', '@omnia/entitlements'],
  serverExternalPackages: ['postgres'],
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Fuera de buscadores, sin incrustar en otras webs y sin filtrar la URL al salir.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
          // same-origin: nada sale hacia otras webs, y los formularios propios llevan Origin real (con no-referrer sería «null»).
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

export default config;
