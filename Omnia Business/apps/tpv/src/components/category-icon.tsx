import { Beef, Beer, Coffee, CupSoda, Fish, IceCreamCone, Martini, Pizza, Salad, Sandwich, Utensils, Wine, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  beer: Beer,
  wine: Wine,
  martini: Martini,
  'cup-soda': CupSoda,
  coffee: Coffee,
  utensils: Utensils,
  salad: Salad,
  beef: Beef,
  fish: Fish,
  'ice-cream': IceCreamCone,
  sandwich: Sandwich,
  pizza: Pizza,
};

export function CategoryIcon({ icon, className = 'size-5' }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? Utensils;
  return <Icon className={className} aria-hidden />;
}
