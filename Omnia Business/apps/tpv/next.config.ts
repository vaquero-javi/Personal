import type { NextConfig } from 'next';

const config: NextConfig = {
  // Los paquetes internos se publican como TypeScript fuente.
  transpilePackages: ['@omnia/core', '@omnia/db', '@omnia/organizations', '@omnia/invoicing', '@omnia/recipes', '@omnia/pos'],
  serverExternalPackages: ['postgres'],
  devIndicators: false,
};

export default config;
