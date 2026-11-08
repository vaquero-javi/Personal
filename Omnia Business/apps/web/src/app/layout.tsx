import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { Splash } from '@/components/splash';
import { splashGuardScript } from '@/components/splash-guard';
import { THEME_COLOR, themeGuardScript } from '@/components/theme';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Omnia',
  description: 'Gestión empresarial multiempresa',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: [{ media: '(prefers-color-scheme: light)', color: THEME_COLOR.light }, { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark }] };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <Script id="theme-guard" strategy="beforeInteractive">{themeGuardScript}</Script>
        <Script id="splash-guard" strategy="beforeInteractive">{splashGuardScript}</Script>
        <Splash />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
