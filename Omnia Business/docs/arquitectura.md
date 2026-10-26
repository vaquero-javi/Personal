# Omnia: arquitectura técnica

ERP/CRM modular y multiempresa. Este documento explica las decisiones; el código y las migraciones son la fuente de verdad.

| Pieza | Dónde |
|---|---|
| Esquema, RLS, triggers | `supabase/migrations/2026102500000{1..5}_*.sql` |
| Pruebas del esquema (38 casos) | `supabase/tests/schema.test.mjs` → `npm run db:test` |
| Transacción con identidad de tenant | `packages/db/src/tenant-transaction.ts` |
| JWT y organización activa | `packages/auth/src/` |
| Módulo de ejemplo (albaranes) | `packages/inventory/src/` |
| API y caché del cliente | `apps/web/src/` |

---

## 1. Decisiones

| Decisión | Elección | Por qué |
|---|---|---|
| Base de datos | PostgreSQL 15+ | ACID, FKs, CHECK, RLS. Requisito del brief. |
| Aislamiento | RLS nativo por `organization_id` en **todas** las tablas de negocio | Un fallo en la aplicación no puede filtrar datos de otra empresa. |
| Integridad entre tenants | FKs **compuestas** `(organization_id, id)` | Ni siquiera un rol que se salte RLS puede enlazar un albarán de A con un artículo de B. |
| Driver | `postgres.js`, conexión directa vía pooler | Transacciones interactivas reales (`supabase-js` / PostgREST no las permite). El mismo código funciona en Supabase, RDS y Cloud SQL. |
| Backend | Next.js Route Handlers (`/api/v1`) + paquetes de dominio | Un solo despliegue en la fase inicial. El dominio no importa Next: pasar a NestJS consiste en cambiar el adaptador HTTP. |
| Monorepo | npm workspaces + Turborepo | Paquetes internos en TS fuente (`transpilePackages`), sin build intermedio. |
| Validación | Zod 4 en la frontera (entrada HTTP, filas de BD, respuestas en el cliente) | Los contratos de `@omnia/inventory/contracts` se comparten entre servidor y cliente. |
| Importes | `numeric` en BD y `string` en TS | Nunca pasan por coma flotante. |
| Multiplataforma | Web responsive → PWA (escritorio) → Capacitor (iOS/Android) | Una sola base de código. Todas las plataformas usan el mismo `/api/v1`. |

---

## 2. Multitenencia y cambio de contexto

### 2.1 Modelo

- `organizations` es la razón social, y `parent_id` modela holdings y grupos.
- `user_organizations` es la membresía (usuario × empresa × **un rol**), con estado `invited | active | suspended`.
- `roles` son por empresa y `role_permissions` usa códigos como `inventory.post` y comodines `inventory.*` y `*`.
- `app.create_organization()` crea la empresa con tres roles base (`owner`, `admin`, `employee`) y deja al creador como propietario.

### 2.2 Flujo de una petición

```
Cliente (web / PWA / Capacitor)
  │  Authorization: Bearer <JWT del IdP>          ← identidad (quién)
  │  x-organization-id: <uuid>[,<uuid>…]          ← contexto (dónde)
  ▼
Route Handler  ──► apps/web/src/server/http.ts · handle()
  1. verifyAccessToken()      firma JWKS, iss, aud, exp           → userId
  2. parseOrganizationScope() cabecera → uuid[] (Zod)
  3. resolveTenantContext()   ¿miembro activo de cada una?        → TenantContext | 403
  4. caso de uso              p. ej. goodsReceipts.post(ctx, id)
  ▼
withTenant(sql, ctx, tx => …)   packages/db
  BEGIN
    SET LOCAL ROLE app_user;                 -- sin BYPASSRLS
    SET LOCAL statement_timeout = '15s';
    SELECT set_config('app.user_id', $1, true),
           set_config('app.org_ids', '{…}', true);
    … consultas del repositorio (RLS activo) …
  COMMIT   -- los SET LOCAL desaparecen: la conexión vuelve limpia al pool
```

### 2.3 Por qué la organización activa no va dentro del JWT

Si la empresa activa fuera un *claim* del JWT, cada cambio de empresa obligaría a refrescar el token, y todas las pestañas compartirían una sola empresa. Por eso:

- El **JWT solo dice quién eres**. Funciona con Supabase Auth hoy y con cualquier IdP OIDC (Cognito, Entra ID, Keycloak) en enterprise: solo cambian `AUTH_ISSUER` y `AUTH_JWKS_URL`.
- La **empresa activa viaja en cada petición** y se valida siempre contra las membresías. En la UI sale de la URL (`/o/[org]/…`), así que dos pestañas pueden estar en empresas distintas.
- **Cambiar de empresa en caliente** consiste en navegar a otra URL. Las claves de TanStack Query empiezan por `['org', orgId, …]` (`apps/web/src/features/inventory/goods-receipts.ts`), de modo que la caché nunca sirve datos de la empresa anterior.
- Revocar un permiso tiene efecto inmediato: no hay que esperar a que caduque un token.

### 2.4 Defensa en profundidad

1. **Aplicación**: `resolveTenantContext` responde 403 si pides una empresa a la que no perteneces.
2. **RLS**: cada política se expresa como `organization_id in (select app.authorized_org_ids('<permiso>'))`. Esa función devuelve la **intersección** entre lo que la sesión pide (`app.org_ids`), las membresías activas del usuario y los roles que conceden ese permiso. Si la capa 1 falla, Postgres devuelve 0 filas o rechaza la escritura.
3. **FKs compuestas**: impiden referencias cruzadas entre empresas incluso a roles privilegiados.
4. **Roles de conexión**: el backend entra como `omnia_api` (`LOGIN NOINHERIT NOBYPASSRLS`) y no tiene privilegios propios hasta hacer `SET ROLE app_user`. Si alguien olvida `withTenant()`, la consulta falla en lugar de saltarse RLS.

Las funciones de autorización son `SECURITY DEFINER` con `search_path = ''`, por dos motivos: leen las membresías sin pasar por RLS (así se evita la recursión entre políticas) y no se pueden secuestrar con objetos homónimos. Como la subconsulta no está correlacionada, Postgres la evalúa **una vez por consulta**, no una vez por fila.

### 2.5 Vista consolidada (holdings)

`x-organization-id: <A>,<B>` hace que las **lecturas** devuelvan filas de A y B. Cada empresa se filtra por separado según el permiso del usuario en ella: con `inventory.read` en A pero no en B, solo se ven las de A. Las **escrituras** exigen una única empresa (`singleOrganization(ctx)`).

### 2.6 Lectura directa con supabase-js (opcional)

`app.current_user_id()` usa el claim `sub` cuando no hay `app.user_id`, y `app.requested_org_ids()` lee la cabecera `x-organization-id` de PostgREST. Por eso las mismas políticas rigen si se lee directamente con `supabase-js` añadiendo esa cabecera. Las escrituras con reglas de negocio siempre pasan por `/api/v1`.

### 2.7 De Supabase a enterprise

Las migraciones `0001`–`0004` son SQL estándar. En RDS Aurora o Cloud SQL basta con:

1. No aplicar `0005_supabase.sql`, crear `omnia_api` con `GRANT app_user` y gestionar su contraseña con IAM o Secrets Manager.
2. Sincronizar `public.users` desde el IdP (webhook o SCIM).
3. Usar RDS Proxy o PgBouncer en modo transacción. `prepare: false` ya está configurado.

---

## 3. Modelo de datos

```
organizations ─┬─ roles ── role_permissions ── permissions (catálogo global)
               ├─ user_organizations ── users
               ├─ custom_field_definitions          (campos dinámicos por empresa)
               ├─ audit_log                         (trigger genérico)
               ├─ document_sequences                (correlativos sin huecos)
               │
               ├─ price_lists ── price_list_items ─┐
               ├─ parties (cliente/proveedor) ─────┤
               ├─ warehouses ──┐                   │
               ├─ inventory_items ─────────────────┘
               │      ├─ stock_levels    (saldo derivado, por almacén)
               │      └─ stock_movements (libro inmutable)
               ├─ goods_receipts ── goods_receipt_lines
               ├─ invoice_series ── invoices ── invoice_lines
               │                        └─ invoice_payments
               ├─ time_entries · leave_requests
               └─ incidents
```

### Convenciones

| Convención | Detalle |
|---|---|
| Clave del tenant | `organization_id uuid not null` + `unique (organization_id, id)` en cada tabla que se pueda referenciar. |
| FKs | Siempre compuestas `(organization_id, x_id)`. |
| Campos dinámicos | `custom_fields jsonb` con `CHECK (jsonb_typeof = 'object')` e índice GIN `jsonb_path_ops`, validados en la aplicación contra `custom_field_definitions` (`parseCustomFields`, Zod generado en tiempo de ejecución, sin claves desconocidas). |
| Inmutabilidad | Movimientos de stock, fichajes y cobros: solo `INSERT` (trigger `forbid_mutation` + ausencia de `GRANT UPDATE/DELETE`). Albaranes y facturas: editables solo en `draft`. |
| Saldo de stock | `stock_levels` **no se escribe**: el trigger de `stock_movements` lo mantiene en la misma transacción. `app_user` solo puede actualizar la columna `min_quantity`. |
| Numeración | `document_sequences` (albaranes, incidencias) y `invoice_series` (facturas). La fila se bloquea hasta el COMMIT y un ROLLBACK devuelve el número, así que no quedan huecos. |
| Errores de negocio en BD | `OM001` = registro inmutable, `OM002` = estado no válido. `mapPgError` los traduce a `INVALID_STATE`. |

### Políticas RLS

`app.apply_tenant_policies(tabla, módulo)` genera las cuatro políticas estándar. Por ejemplo, para `warehouses`:

```sql
create policy warehouses_select on warehouses for select to app_user
  using (organization_id in (select app.authorized_org_ids('inventory.read')));
create policy warehouses_insert on warehouses for insert to app_user
  with check (organization_id in (select app.authorized_org_ids('inventory.write')));
create policy warehouses_update on warehouses for update to app_user
  using      (organization_id in (select app.authorized_org_ids('inventory.write')))
  with check (organization_id in (select app.authorized_org_ids('inventory.write')));
create policy warehouses_delete on warehouses for delete to app_user
  using (organization_id in (select app.authorized_org_ids('inventory.delete')));
```

Estas tablas tienen políticas escritas a mano:

| Tabla | Regla |
|---|---|
| `organizations` | Se ven todas tus membresías (para el selector de empresa); editar exige `org.manage`. |
| `role_permissions` | `roles.manage` no puede conceder `*` ni tocar roles de sistema (evita la escalada de privilegios). |
| `stock_movements` | Lectura con `inventory.read`; alta con `inventory.post`; nunca UPDATE ni DELETE. |
| `goods_receipts` | Política *restrictive*: pasar a `posted` exige `inventory.post`. |
| `invoices` | Política *restrictive*: por UPDATE directo solo puede quedar en `draft` o `cancelled`; la emisión pasa por `app.issue_invoice()`. |
| `time_entries` | El empleado ficha lo suyo, sin `manual` y con hora plausible (hasta 72 h atrás para sincronizar el modo offline); RRHH (`hr.time.manage`) registra correcciones. |
| `incidents` | Visibles con `incidents.read` o si eres quien la reporta o la persona asignada; quien la tiene asignada no puede reasignarla. |

### Facturación y VeriFactu

`app.issue_invoice(invoice, serie, fecha)` hace en una sola transacción:

1. Bloquea la factura y comprueba el permiso `invoicing.issue`.
2. Bloquea la **serie** con `FOR UPDATE` para obtener una numeración correlativa sin huecos.
3. Bloquea el **emisor** con `FOR NO KEY UPDATE`: hay una sola cadena de huellas por NIF, y este bloqueo no frena las comprobaciones de FK del resto de tablas.
4. Suma las líneas (redondeo por línea en columnas generadas).
5. Calcula la huella SHA-256 encadenada a la factura anterior y marca `fiscal_status = 'pending'`.

Un *worker* (pendiente) envía las facturas `pending` a la AEAT, o las firma con XAdES para TicketBAI, y guarda la respuesta en `fiscal_response`.

> ⚠ El formato de la huella sigue el registro de alta de VeriFactu, pero **hay que validarlo contra la especificación técnica vigente de la AEAT** antes de producción. Lo mismo vale para los registros de anulación, que aún no están implementados.

---

## 4. Estructura del repositorio

```
omnia/
├── apps/
│   └── web/                         Next.js 16: UI + API (/api/v1) + PWA
│       └── src/
│           ├── app/api/v1/…         Route Handlers finos: solo llaman a casos de uso
│           ├── server/              container.ts (composición) · http.ts (auth, tenant, errores)
│           ├── features/<módulo>/   hooks de TanStack Query por módulo
│           └── lib/                 api-client (valida respuestas con Zod) · session
├── packages/
│   ├── core/                        errores de dominio, TenantContext, decimales, campos dinámicos
│   ├── db/                          pool postgres.js · withTenant/withUser · mapeo de errores PG
│   ├── auth/                        verificación JWT (JWKS) · resolución de la organización activa
│   └── inventory/                   módulo de ejemplo, por capas:
│       └── src/
│           ├── domain/              esquemas Zod, tipos y reglas puras  (export "./contracts")
│           ├── application/         casos de uso + puertos (interfaces) + tests unitarios
│           └── infrastructure/      adaptador Postgres (repositorios, UnitOfWork) + test de integración
├── supabase/
│   ├── migrations/                  0001 tenencia/RBAC · 0002 almacén · 0003 facturación · 0004 RRHH/incidencias · 0005 Supabase
│   └── tests/schema.test.mjs        pruebas del esquema sobre PGlite
└── docs/arquitectura.md
```

**Regla de dependencias**: `domain` no depende de nada salvo `core` y Zod. `application` solo conoce los puertos. `infrastructure` implementa los puertos. `apps/web` compone las piezas.

**Módulos siguientes**, con la misma forma que `inventory`: `invoicing`, `purchasing`, `sales`, `hr` e `incidents`. Las tablas de facturación, RRHH e incidencias ya existen; falta su paquete TypeScript.

---

## 5. Módulo de ejemplo: contabilizar un albarán

`createGoodsReceiptService(uow).post(ctx, receiptId)` (`packages/inventory/src/application/goods-receipt.service.ts`) hace estos pasos dentro de **una** transacción:

| Paso | Qué hace | Qué garantiza |
|---|---|---|
| 1 | `SELECT … FROM goods_receipts WHERE id = $1 FOR UPDATE` | Dos «contabilizar» simultáneos se serializan aquí. |
| 2 | Si ya está `posted`, devuelve `alreadyPosted: true` | Idempotencia: los reintentos desde el móvil no duplican stock. |
| 3 | `assertPostable` (regla de dominio) | Rechaza albaranes anulados o sin líneas. |
| 4 | Un `INSERT` multifila en `stock_movements`, ordenado por artículo | Orden canónico de bloqueo: sin interbloqueos entre albaranes. |
| 4b | El trigger actualiza `stock_levels` (y el coste medio ponderado) | El saldo cuadra siempre con el libro. La CHECK `on_hand >= 0` aborta las salidas sin existencias. |
| 4c | Índice único `(organization_id, source_type, source_line_id)` | Aunque el código fallara, una línea no puede contabilizarse dos veces. |
| 5 | `UPDATE … SET status = 'posted', posted_by = app.current_user_id()` | El autor lo fija Postgres, no el cliente. |

Si algo falla, el ROLLBACK lo deshace todo. Los `serialization_failure` y `deadlock_detected` se reintentan con *backoff* (`withTenant`, hasta 3 intentos). El resto se traduce a errores de dominio y llega al cliente como `application/problem+json`: `409 INSUFFICIENT_STOCK`, `409 CONFLICT`, `422 VALIDATION`, etc.

---

## 6. Multiplataforma

- **Web y PWA (escritorio)**: la misma app Next.js, *mobile-first*. Falta añadir el *manifest* y el *service worker* cuando haya pantallas.
- **iOS y Android**: Capacitor en `apps/mobile` (pendiente) carga la app desplegada y añade plugins nativos: geolocalización para fichar, cámara y escáner para los albaranes. Como todo pasa por `/api/v1` con Bearer y la cabecera de organización, no depende de cookies ni de Server Actions.
- **Offline**: los fichajes llevan `occurred_at` (dispositivo) y `recorded_at` (servidor), y la RLS acepta hasta 72 h de retraso. La cola offline del cliente está pendiente.

---

## 7. Verificación

```bash
npm install
npm run db:test                         # 38 pruebas del esquema (RLS, FKs, stock, facturación, RBAC)
npx vitest run --root packages/inventory  # 7 unitarias + 6 de integración postgres.js → Postgres
npx tsc -p apps/web                     # y el resto de paquetes
```

La integración usa PGlite (Postgres embebido) expuesto por socket, así que no hace falta Docker. PGlite atiende **una sola conexión**: la prueba «concurrente» valida la idempotencia, pero no el bloqueo real entre conexiones. Para eso hay que ejecutar la misma suite contra un Postgres de verdad (Supabase local o un contenedor en CI).

---

## 8. Pendiente y riesgos

| Tema | Estado |
|---|---|
| Huella VeriFactu, registros de anulación, envío a la AEAT, firma TicketBAI | Esqueleto en BD; falta validar contra la especificación y escribir el worker. |
| Pedidos de compra, pagos a proveedores, costes | Sin tablas. Al crearlas, añadir `purchase_order_id` (FK compuesta) a `goods_receipts`. Los pagos de facturas recibidas ya existen (`invoice_payments`). |
| TPV y ventas B2B | Hay tarifas y movimientos `sale`; falta el documento de venta. |
| Turnos | Sin tabla. Vacaciones y permisos sí (`leave_requests`; falta impedir solapes con `btree_gist`). |
| Stock negativo por empresa | Hoy está prohibido siempre. Se haría configurable con `organizations.settings`. |
| Realtime | `postgres_changes` de Supabase no conoce `app.org_ids`: usar *broadcast* desde el backend. |
| Volumen | Particionar `stock_movements` y `audit_log` por fecha cuando superen unos 50 M de filas. |
| Pantallas | Ninguna todavía: `PRODUCT.md` está listo para diseñarlas con `/impeccable`. |
