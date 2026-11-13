import { hasPermission } from '@omnia/organizations';
import { Window } from '@/components/shell/window';
import { NewOrganizationForm } from '@/features/organizations/new-organization-form';
import { myMemberships } from '@/server/session';

export const metadata = { title: 'Nueva sociedad · Omnia' };

export default async function NewOrganizationPage({ searchParams }: { searchParams: Promise<{ holding?: string }> }) {
  const { holding } = await searchParams;
  const holdings = (await myMemberships())
    .filter((m) => m.kind === 'holding' && hasPermission(m.permissions, 'org.manage'))
    .map((m) => ({ id: m.organizationId, label: m.tradeName ?? m.legalName }));
  return (
    <Window>
      <header className="pt-4 md:pt-10">
        <h1 className="text-[28px] leading-[1.15] font-bold tracking-[-0.022em] md:text-[34px]">Nueva sociedad u holding</h1>
        <p className="mt-1 max-w-xl text-[15px] text-ink-3">
          Sus datos quedan aislados de las demás y tendrás el rol de propietario. Las empresas (negocios o locales) se crean después, dentro de cada sociedad, en Ajustes › Empresas.
        </p>
      </header>
      <div className="max-w-xl rounded-[var(--radius-card)] bg-sheet p-5 shadow-[var(--shadow-card)]">
        <NewOrganizationForm holdings={holdings} {...(holding && holdings.some((h) => h.id === holding) ? { defaultParentId: holding } : {})} />
      </div>
    </Window>
  );
}
