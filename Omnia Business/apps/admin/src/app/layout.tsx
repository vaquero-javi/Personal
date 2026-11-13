import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { THEME_COLOR, themeGuardScript } from '@/components/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Omnia · Equipo',
  description: 'Panel interno del equipo de Omnia',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-dvh bg-carton text-ink">
        <Script id="theme-guard" strategy="beforeInteractive">{themeGuardScript}</Script>
        {children}
      </body>
    </html>
  );
}
