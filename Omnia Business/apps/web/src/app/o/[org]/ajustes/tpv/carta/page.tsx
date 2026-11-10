import { Cell, PageHeader, Ruled } from "@/components/ui/layout";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import {
  ActionForm,
  Notice,
  SelectField,
  TextField,
} from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/button";
import { MenuEditor } from "@/features/pos/menu-editor";
import { container } from "@/server/container";
import { requireOrg } from "@/server/session";
import {
  createMenuItem,
  removePosCategory,
  removePosTable,
  restorePosTable,
  saveMenuItem,
  savePosCategory,
  savePosTable,
} from "../../actions";
import { menuWarehouse } from "./warehouse";

export const metadata = { title: "Sala y carta · TPV · Omnia" };

const ICONS = [
  { value: "beer", label: "Cerveza" },
  { value: "wine", label: "Vino" },
  { value: "martini", label: "Cóctel" },
  { value: "cup-soda", label: "Refresco" },
  { value: "coffee", label: "Café" },
  { value: "utensils", label: "Cubiertos" },
  { value: "salad", label: "Ensalada" },
  { value: "beef", label: "Carne" },
  { value: "fish", label: "Pescado" },
  { value: "sandwich", label: "Bocadillo" },
  { value: "pizza", label: "Pizza" },
  { value: "ice-cream", label: "Postre" },
];

export default async function PosMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ almacen?: string }>;
}) {
  const { org } = await params;
  const { almacen } = await searchParams;
  const { ctx, can } = await requireOrg(org);
  const back = { href: `/o/${org}/ajustes/tpv`, label: "TPV" };
  if (!can("pos.manage")) {
    return (
      <>
        <PageHeader title="Sala y carta" back={back} />
        <Cell>
          <Notice tone="warning">
            La carta la gestiona quien tenga el permiso de encargado de TPV.
          </Notice>
        </Cell>
      </>
    );
  }
  const { selected, options } = await menuWarehouse(ctx, almacen);
  // Mesas y categorías no dependen del almacén; los productos sí (costes y stock).
  const [categories, floor, products, ingredients] = await Promise.all([
    container().pos.categories(ctx),
    container().pos.floor(ctx, { includeInactive: true }),
    selected
      ? container().recipes.products(ctx, selected.id)
      : Promise.resolve([]),
    selected
      ? container().recipes.ingredients(ctx, selected.id)
      : Promise.resolve([]),
  ]);
  const onMenu = new Set(products.map((p) => p.id));
  const base = `/o/${org}/ajustes/tpv/carta`;
  return (
    <>
      <PageHeader
        title="Sala y carta"
        description={`Mesas, categorías, productos y precios del TPV. Lo que cambies aquí aparece en el TPV en unos segundos, sin recargar.${selected ? ` Costes y food cost según el coste medio en ${selected.name}; food cost sobre el precio sin IVA.` : ""}`}
        back={back}
        actions={
          selected && options.length > 1 ? (
            <form method="get" className="flex items-center gap-2 text-sm">
              <label htmlFor="almacen" className="text-ink-3">
                Costes en
              </label>
              <select
                id="almacen"
                name="almacen"
                defaultValue={selected.id}
                className="h-9 rounded-[10px] bg-fill px-3"
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="pressable h-9 rounded-full bg-fill px-3.5 font-semibold text-tint hover:bg-fill-strong"
              >
                Ver
              </button>
            </form>
          ) : undefined
        }
      />
      <Ruled
        cols="xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
        className="mb-4 md:mb-5"
      >
        <Cell title="Mesas">
          {floor.tables.length === 0 ? (
            <p className="text-sm text-ink-2">
              Sin mesas. Las cuentas de barra funcionan sin mesa.
            </p>
          ) : (
            <Table minWidth={560}>
              <thead>
                <tr>
                  <Th>Zona</Th>
                  <Th>Mesa</Th>
                  <Th align="right">Plazas</Th>
                  <Th align="right">Orden</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {floor.tables.map((t) => (
                  <Tr key={t.id}>
                    <Td className="text-ink-2">{t.area}</Td>
                    <Td
                      className={
                        t.isActive ? "font-medium" : "text-ink-3 line-through"
                      }
                    >
                      {t.name}
                    </Td>
                    <Td align="right">{t.seats}</Td>
                    <Td align="right">{t.sortOrder}</Td>
                    <Td align="right">
                      {t.isActive ? (
                        <ActionForm
                          action={removePosTable.bind(null, org, t.id)}
                        >
                          <SubmitButton
                            variant="secondary"
                            className="h-8 px-3"
                            disabled={t.tab !== null}
                          >
                            Quitar
                          </SubmitButton>
                        </ActionForm>
                      ) : (
                        <ActionForm
                          action={restorePosTable.bind(null, org, t.id)}
                        >
                          <SubmitButton
                            variant="secondary"
                            className="h-8 px-3"
                          >
                            Reactivar
                          </SubmitButton>
                        </ActionForm>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Cell>
        <Cell title="Añadir mesa">
          <ActionForm
            action={savePosTable.bind(null, org)}
            className="flex flex-col gap-3"
            resetOnSuccess
          >
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Nombre"
                name="name"
                required
                maxLength={30}
                placeholder="12, T3, Barra 1…"
              />
              <TextField
                label="Zona"
                name="area"
                required
                maxLength={30}
                defaultValue="Sala"
                list="pos-areas"
              />
              <datalist id="pos-areas">
                {[...new Set(floor.tables.map((t) => t.area))].map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Plazas"
                name="seats"
                type="number"
                min={1}
                max={99}
                defaultValue={4}
              />
              <TextField
                label="Orden"
                name="sortOrder"
                type="number"
                min={0}
                max={9999}
                defaultValue={floor.tables.length + 1}
              />
            </div>
            <div>
              <SubmitButton>Añadir mesa</SubmitButton>
            </div>
          </ActionForm>
        </Cell>

        <Cell title="Categorías de la carta">
          {categories.length === 0 ? (
            <p className="text-sm text-ink-2">
              Sin categorías: la carta del TPV está vacía.
            </p>
          ) : (
            <Table minWidth={480}>
              <thead>
                <tr>
                  <Th>Categoría</Th>
                  <Th>Icono</Th>
                  <Th align="right">Orden</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <Tr key={c.id}>
                    <Td className="font-medium">{c.name}</Td>
                    <Td className="text-ink-2">
                      {ICONS.find((i) => i.value === c.icon)?.label ?? c.icon}
                    </Td>
                    <Td align="right">{c.sortOrder}</Td>
                    <Td align="right">
                      <ActionForm
                        action={removePosCategory.bind(null, org, c.id)}
                      >
                        <SubmitButton variant="secondary" className="h-8 px-3">
                          Quitar
                        </SubmitButton>
                      </ActionForm>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Cell>
        <Cell title="Añadir categoría">
          <ActionForm
            action={savePosCategory.bind(null, org)}
            className="flex flex-col gap-3"
            resetOnSuccess
          >
            <TextField
              label="Nombre"
              name="name"
              required
              maxLength={30}
              placeholder="Cócteles, Tapas…"
            />
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Icono"
                name="icon"
                options={ICONS}
                defaultValue="utensils"
              />
              <TextField
                label="Orden"
                name="sortOrder"
                type="number"
                min={0}
                max={9999}
                defaultValue={categories.length + 1}
              />
            </div>
            <div>
              <SubmitButton>Añadir categoría</SubmitButton>
            </div>
          </ActionForm>
        </Cell>
      </Ruled>
      {!selected ? (
        <Cell title="Productos y precios">
          <Notice tone="warning">
            Crea antes un almacén (Almacén › Almacenes): los productos calculan
            costes y stock sobre él.
          </Notice>
        </Cell>
      ) : (
        <MenuEditor
          base={base}
          products={products}
          categories={categories
            .filter((c) => c.isActive)
            .map((c) => ({ id: c.id, name: c.name }))}
          candidates={ingredients
            .filter((i) => !onMenu.has(i.id))
            .map((i) => ({ id: i.id, name: i.name }))}
          save={saveMenuItem.bind(null, org)}
          create={createMenuItem.bind(null, org)}
        />
      )}
    </>
  );
}
