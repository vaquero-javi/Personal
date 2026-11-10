import { ChartColumn, House, ListChecks, Package, Receipt, ShoppingBag, TriangleAlert, Truck, Users, type LucideIcon } from 'lucide-react';

/** Los módulos de Omnia con su baldosa de color, como en la barra lateral de la app. */
export const MODULE_TILES: { slug: string; label: string; Icon: LucideIcon; tile: string }[] = [
  { slug: 'inicio', label: 'Inicio', Icon: House, tile: 'bg-sys-blue' },
  { slug: 'ventas', label: 'Ventas', Icon: ShoppingBag, tile: 'bg-sys-pink' },
  { slug: 'compras', label: 'Compras', Icon: Truck, tile: 'bg-sys-orange' },
  { slug: 'almacen', label: 'Almacén', Icon: Package, tile: 'bg-sys-yellow' },
  { slug: 'facturacion', label: 'Facturación', Icon: Receipt, tile: 'bg-sys-green' },
  { slug: 'rrhh', label: 'RRHH', Icon: Users, tile: 'bg-sys-indigo' },
  { slug: 'incidencias', label: 'Incidencias', Icon: TriangleAlert, tile: 'bg-sys-red' },
  { slug: 'tareas', label: 'Tareas', Icon: ListChecks, tile: 'bg-sys-teal' },
  { slug: 'estadisticas', label: 'Estadísticas', Icon: ChartColumn, tile: 'bg-sys-purple' },
];

export function Tile({ Icon, tile, size = 26 }: { Icon: LucideIcon; tile: string; size?: number }) {
  return (
    <span aria-hidden style={{ width: size, height: size }} className={`flex shrink-0 items-center justify-center rounded-[7px] text-white ${tile}`}>
      <Icon className="size-[60%]" strokeWidth={2.2} />
    </span>
  );
}

