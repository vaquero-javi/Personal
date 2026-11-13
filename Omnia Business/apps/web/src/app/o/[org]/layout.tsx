import type { ReactNode } from 'react';
import { spineCss } from '@/components/shell/spines';
import { Window } from '@/components/shell/window';
import { EstablishmentPicker } from '@/components/shell/establishment-picker';
import { setActiveEstablishment } from '@/server/establishment-actions';
import { activeEstablishment, orgEstablishments, requireOrg } from '@/server/session';

export default async function OrganizationLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireOrg(slug);
  const [establishments, active] = await Promise.all([orgEstablishments(slug), activeEstablishment(slug)]);
  const picker = establishments.filter((e) => e.isActive);
  const pickerEl = picker.length > 0 && (
    <EstablishmentPicker
      establishments={picker.map(({ id, name }) => ({ id, name }))}
      activeId={active?.id ?? null}
      action={setActiveEstablishment.bind(null, slug)}
    />
  );

  return (
    <Window
      toolbar={
        <>
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: spineCss(org.spineColor) }} />
          <h1 className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em]">{org.legalName}</h1>
          {pickerEl && <div className="ml-auto">{pickerEl}</div>}
        </>
      }
    >
      {/* En móvil la barra de la ventana no se ve: el selector va encima del contenido. */}
      {pickerEl && <div className="-mb-2 flex md:hidden">{pickerEl}</div>}
      {children}
    </Window>
  );
}
