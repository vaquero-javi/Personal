import type { Metadata } from 'next';
import { Landing } from '@/features/landing/landing';

export const metadata: Metadata = {
  title: 'Omnia · Toda tu empresa en una sola app',
  description: 'Ventas, facturas con VeriFactu, compras, almacén, fichajes y turnos en una sola app. Prueba Omnia gratis durante un mes.',
};

export default function Home() {
  return <Landing />;
}
