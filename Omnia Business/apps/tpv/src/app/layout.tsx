import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { Splash } from '@/components/splash';
import { splashGuardScript } from '@/components/splash-guard';
import { THEME_COLOR, themeGuardScript } from '@/components/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Omnia TPV',
  description: 'Punto de venta para hostelería',
  appleWebApp: { capable: true, title: 'Omnia TPV', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-dvh">
        <Script id="theme-guard" strategy="beforeInteractive">{themeGuardScript}</Script>
        <Script id="splash-guard" strategy="beforeInteractive">{splashGuardScript}</Script>
        <Splash />
        {children}
      </body>
    </html>
  );
}
