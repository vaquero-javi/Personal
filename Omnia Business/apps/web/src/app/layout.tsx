import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { Splash } from '@/components/splash';
import { splashGuardScript } from '@/components/splash-guard';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Omnia',
  description: 'Gestión empresarial multiempresa',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#16181d' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <Script id="splash-guard" strategy="beforeInteractive">{splashGuardScript}</Script>
        <Splash />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
