import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { Splash } from '@/components/splash';
import { splashGuardScript } from '@/components/splash-guard';
import './globals.css';

export const metadata: Metadata = {
  title: 'Omnia TPV',
  description: 'Punto de venta para hostelería',
  appleWebApp: { capable: true, title: 'Omnia TPV', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#16181d',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-dvh">
        <Script id="splash-guard" strategy="beforeInteractive">{splashGuardScript}</Script>
        <Splash />
        {children}
      </body>
    </html>
  );
}
