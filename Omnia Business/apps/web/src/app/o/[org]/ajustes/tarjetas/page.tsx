import { Badge, Cell, EmptyState, PageHeader, Ruled } from '@/components/ui/layout';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ActionForm, CheckboxField, TextField } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/button';
import { StaffCard } from '@/features/staff-cards/staff-card';
import { formatDate } from '@/lib/format';
import { container } from '@/server/container';
import { requireOrg } from '@/server/session';
import { issueStaffCard, myCardQr, revokeStaffCard, saveStaffPolicy } from '../actions';

export const metadata = { title: 'Tarjetas de empleado · Ajustes · Omnia' };

// La tarjeta estándar tiene un QR fijo y definitivo (internamente `apple`). Las de
// QR dinámico (`google`) son de una prueba anterior y conviene reemitirlas.
const isLegacy = (w: 'apple' | 'google') => w === 'google';

const pct = (v: string | null) => (v ? `${Number(v).toLocaleString('es-ES')} %` : '—');

export default async function StaffCardsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, can } = await requireOrg(org);
  const manage = can('staff_cards.manage');
  const service = container().staffCards;
  const [mine, policies, team, roles] = await Promise.all([
    service.myCards(ctx),
    manage ? service.policies(ctx) : Promise.resolve([]),
    manage ? service.team(ctx) : Promise.resolve([]),
    manage ? service.roles(ctx) : Promise.resolve([]),
  ]);
  const general = policies.find((p) => p.roleId === null);
  const byRole = new Map(policies.filter((p) => p.roleId).map((p) => [p.roleId!, p]));

  return (
    <>
      <PageHeader
        title="Tarjetas de empleado"
        description="Un QR personal y permanente para el descuento de empleado en el TPV. El empleado la enseña desde esta pantalla en su móvil."
      />
      <Ruled cols="xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Cell title="Tu tarjeta" className="xl:col-span-2">
          {mine.length === 0 ? (
            <EmptyState title="Todavía no tienes tarjeta de empleado">
              La emite un responsable desde esta misma pantalla. Cuando la tengas aparecerá aquí, lista para enseñarla en el TPV.
            </EmptyState>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {mine.map((card) => (
                <div key={card.id} className="flex flex-col gap-3">
                  <StaffCard card={card} loadQr={myCardQr.bind(null, org, card.id)} />
                  {isLegacy(card.wallet) ? (
                    <p className="text-xs font-medium text-warning">
                      Esta tarjeta es de una prueba anterior (su QR cambia cada 30 segundos). Pide a un responsable que te emita la definitiva.
                    </p>
                  ) : (
                    <p className="text-xs text-ink-3">
                      Este QR es tuyo y no cambia: sirve para todos tus descuentos. Toca la tarjeta para verla a pantalla completa y enséñala en el TPV; te pedirán tu PIN de Omnia. No la compartas: cada uso queda registrado con tu nombre.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Cell>

        {manage && (
          <>
            <Cell title="Descuento de empleado" className="xl:col-span-2">
              <p className="mb-3 text-sm text-ink-2">
                Cada persona recibe el descuento de su rol o, si su rol no tiene uno propio, el general. El porcentaje lo aplica siempre el servidor: el TPV no puede cambiarlo.
              </p>
              <ul className="divide-y divide-line border-y border-line">
                {[{ id: null as string | null, name: 'General (resto de roles)' }, ...roles].map((role) => {
                  const p = role.id ? byRole.get(role.id) : general;
                  return (
                    <li key={role.id ?? 'general'} className="grid gap-3 py-3 lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start">
                      <div className="pt-1">
                        <p className="font-medium">{role.name}</p>
                        {!p && <p className="text-xs text-ink-3">{role.id ? (general ? `Usa la general (${pct(general.discountPct)})` : 'Sin descuento') : 'Sin descuento general'}</p>}
                        {p && !p.isActive && <Badge tone="muted">Desactivado</Badge>}
                      </div>
                      <ActionForm action={saveStaffPolicy.bind(null, org, role.id)} className="grid grid-cols-2 items-start gap-3 sm:grid-cols-[6rem_6rem_7rem_minmax(0,1fr)_auto]">
                        <TextField label="Descuento %" name="discountPct" type="number" min={0.01} max={100} step={0.01} required defaultValue={p?.discountPct ?? ''} placeholder="—" />
                        <TextField label="Usos al día" name="maxUsesPerDay" type="number" min={1} max={50} defaultValue={p?.maxUsesPerDay ?? ''} placeholder="Sin límite" />
                        <TextField label="Tope €/mes" name="monthlyDiscountCap" type="number" min={1} step={0.01} defaultValue={p?.monthlyDiscountCap ?? ''} placeholder="Sin límite" />
                        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1 sm:pt-5">
                          <CheckboxField label="Pedir el PIN del titular" name="requirePin" defaultChecked={p?.requirePin ?? true} />
                          <CheckboxField label="Puede aplicársela él mismo en el TPV" name="allowSelfService" defaultChecked={p?.allowSelfService ?? false} />
                          {p && <CheckboxField label="Desactivar" name="disabled" defaultChecked={!p.isActive} />}
                        </div>
                        <div className="sm:pt-5">
                          <SubmitButton variant="secondary">{p ? 'Guardar' : 'Crear'}</SubmitButton>
                        </div>
                      </ActionForm>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-sm text-ink-3">
                El QR de cada tarjeta es fijo, así que una foto o una captura también serviría: deja «Pedir el PIN» activado para que haga falta el titular delante. Si una tarjeta se filtra, reemítela.
              </p>
            </Cell>

            <Cell title="Equipo" className="xl:col-span-2">
              <Table minWidth={900}>
                <thead>
                  <tr>
                    <Th>Persona</Th>
                    <Th>Rol</Th>
                    <Th>Le corresponde</Th>
                    <Th>Tarjeta</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {team.map((m) => (
                    <Tr key={m.userId}>
                      <Td className="font-medium">{m.name}</Td>
                      <Td className="text-ink-2">{m.roleName}</Td>
                      <Td>{m.discountPct ? <span className="font-semibold tabular-nums">−{pct(m.discountPct)}</span> : <span className="text-sm text-ink-3">Sin descuento</span>}</Td>
                      <Td>
                        {m.cards.length === 0 ? (
                          <span className="text-sm text-ink-3">Ninguna</span>
                        ) : (
                          <ul className="flex flex-col gap-2">
                            {m.cards.map((c) => (
                              <li key={c.id} className="flex flex-wrap items-center gap-2">
                                {isLegacy(c.wallet) ? <Badge tone="warning">QR dinámico · reemítela</Badge> : <Badge tone="ok">Activa</Badge>}
                                <span className="text-xs text-ink-3">desde {formatDate(c.issuedAt.slice(0, 10))}</span>
                                <ActionForm action={revokeStaffCard.bind(null, org, c.id)} confirm={`¿Revocar la tarjeta de ${m.name}? Deja de valer en el TPV al momento y su pase queda anulado.`}>
                                  <SubmitButton variant="caution" className="h-7 px-2 text-xs">Revocar</SubmitButton>
                                </ActionForm>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                      <Td>
                        <ActionForm
                          action={issueStaffCard.bind(null, org, m.userId)}
                          {...(m.cards.length > 0 ? { confirm: `¿Emitir una tarjeta nueva para ${m.name}? La actual dejará de valer.` } : {})}
                        >
                          <SubmitButton variant="secondary" className="h-8 px-3">
                            {m.cards.length > 0 ? 'Reemitir' : 'Emitir tarjeta'}
                          </SubmitButton>
                        </ActionForm>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <p className="mt-3 text-sm text-ink-3">
                Cada persona tiene una sola tarjeta y su QR es definitivo. Reemítela solo si se pierde o se filtra: la anterior deja de valer al momento. Al dar de baja a alguien en Miembros, sus tarjetas se revocan solas.
              </p>
            </Cell>
          </>
        )}
      </Ruled>
    </>
  );
}
