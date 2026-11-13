import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PageHeader } from '@/components/ui';
import { FeatureMatrix } from '@/features/feature-matrix';
import { formatDateTime } from '@/lib/format';
import { container } from '@/server/container';
import { requireAdmin } from '@/server/session';

export default async function AdminOrganizationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!z.uuid().safeParse(orgId).success) notFound();
  const { userId } = await requireAdmin();
  const data = await container()
    .entitlements.adminOrganizationFeatures(userId, orgId)
    .catch((error: unknown) => {
      if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
      throw error;
    });
  const { organization } = data;

  return (
    <>
      <PageHeader
        back={{ href: '/', label: 'Sociedades' }}
        title={organization.tradeName ?? organization.legalName}
        description={`${organization.legalName} · ${organization.taxId} · alta ${formatDateTime(organization.createdAt)}`}
      />
      <FeatureMatrix organizationId={organization.id} initial={data.features} />
    </>
  );
}
