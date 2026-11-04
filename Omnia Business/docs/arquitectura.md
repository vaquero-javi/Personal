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
| TPV de hostelería (app aparte) | `apps/tpv/` · `packages/pos/` · `packages/recipes/` · migración `0012_pos` |

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
5. Calcula la huella SHA-256 encadenada a la factura anterior y marca `fiscal_status = 'pending'`. La «anterior» es la de mayor `fiscal_chain_seq`, un número de secuencia que se toma con el emisor bloqueado; `fiscal_record_at` va truncado al segundo y no sirve para ordenar.

Quedan fuera del sistema fiscal (`fiscal_status = 'not_applicable'`) las facturas de una sociedad sin régimen y, si en Ajustes › TPV se apaga «Tickets con VeriFactu» (`settings.pos_tickets_verifactu`), los tickets que cobra el TPV. Llevan su propia cadena de huellas, separada de la registrada.

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

## 5b. Rendimiento de listados (reglas)

Medidas con `EXPLAIN ANALYZE` y RLS activa sobre 120.000 facturas en 4 empresas. Implementación de referencia: `packages/invoicing/src/{domain,infrastructure}/invoice-list*` + migración `0023_list_performance`.

| Regla | Por qué |
|---|---|
| **Filtrar siempre por organización de forma explícita** (`orgScope(tx, ctx, 'x.organization_id')`), además de la RLS. | La condición de la RLS es una subconsulta y no sirve como prefijo de índice: sin el filtro explícito, Postgres recorre la tabla de **todas** las empresas (Seq Scan). Con él, Index Scan. La RLS sigue decidiendo qué se ve. |
| **Paginar por cursor (keyset), nunca con `LIMIT` fijo ni `OFFSET`.** El orden termina en `id` para que no haya empates. | El `limit 300` escondía facturas (en un bar con TPV, 300 tickets son menos de un día). `OFFSET` lee y descarta todas las filas anteriores. Con keyset, la página 300 cuesta lo mismo que la 1 (0,18 ms). |
| **La clave del cursor, sobre columnas simples** y en el mismo orden que el índice. Nada de `coalesce()` ni funciones en la comparación: si hace falta, columna generada. | Con RLS, Postgres solo lleva al índice condiciones que puede demostrar *leakproof*; un `coalesce` no lo es y el cursor pasa a ser un filtro fila a fila (8 ms → 0,14 ms al quitarlo). |
| **Marcas de tiempo del cursor como texto:** `${v}::text::timestamptz`. | Si el parámetro se declara `timestamptz`, postgres.js lo convierte en `Date` y trunca los microsegundos: el cursor se salta las filas empatadas. |
| **Totales con agregados en la base** (`sum`, con índice parcial si el subconjunto es pequeño), nunca sumando en JS lo que se ha traído. | Una suma de «lo que hay en pantalla» es incorrecta en cuanto se pagina. |
| **Página + 1 fila en vez de `COUNT(*)`.** | Contar recorre todo el histórico en cada petición. |
| **Toda FK que se use en joins o en `ON DELETE RESTRICT` lleva índice** `(organization_id, fk)`. | Sin él, borrar un artículo o abrir la ficha de un tercero recorre la tabla hija entera. Las FKs a `users` (`created_by`…) quedan sin índice a propósito. |

Pendiente de aplicar estas reglas: los demás listados (`purchasing`, `sales`, `incidents`, `tasks`, `parties`, `warehouse.movements`) siguen con `limit` fijo y sin filtro explícito de organización. La búsqueda de texto (`ilike '%…%'`) recorre las facturas de la empresa; con volumen, índice trigram (`pg_trgm`).

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
| TPV y ventas B2B | Ventas B2B con pedidos; TPV de hostelería en `apps/tpv` (ver §9). |
| Turnos | Sin tabla. Vacaciones y permisos sí (`leave_requests`; falta impedir solapes con `btree_gist`). |
| Stock negativo por empresa | Hoy está prohibido siempre. Se haría configurable con `organizations.settings`. |
| Realtime | `postgres_changes` de Supabase no conoce `app.org_ids`: usar *broadcast* desde el backend. |
| Volumen | Particionar `stock_movements` y `audit_log` por fecha cuando superen unos 50 M de filas. |
| Pantallas | Ninguna todavía: `PRODUCT.md` está listo para diseñarlas con `/impeccable`. |

---

## 9. TPV de hostelería

`apps/tpv` es una segunda app Next.js (puerto 3200) para la tablet de la barra. Comparte base de datos y paquetes de dominio con el backoffice: no hay sincronización entre sistemas, así que el stock, la numeración de tickets y la cadena VeriFactu son únicos.

| Pieza | Dónde |
|---|---|
| Esquema, RLS y funciones | `supabase/migrations/20261028000012_pos.sql` |
| Terminales, PIN, sala, cuentas, cobro y caja | `packages/pos/src/index.ts` |
| Importes del ticket (aritmética idéntica a `invoice_lines`) | `packages/pos/src/pricing.ts` (+ tests) |
| Escandallos, costes y descuento de ingredientes | `packages/recipes/src/index.ts` (lo usan las dos apps) |
| Sesión del terminal y del turno | `apps/tpv/src/server/session.ts` |
| Ajustes (terminales, PIN, mesas, categorías, stock negativo) | `apps/web/src/app/o/[org]/ajustes/tpv/` |

### Acceso: dispositivo + persona

1. **Vincular el terminal.** Un encargado lo crea en el backoffice y obtiene un código de 8 caracteres (30 min, un solo uso). La tablet lo canjea (`app.pos_pair_terminal`) por un token aleatorio de 256 bits que guarda en una cookie `httpOnly`; en la base solo queda su SHA-256. Desvincular invalida el token al momento.
2. **Entrar con PIN.** Con un terminal válido se listan las personas cuyo rol tiene `pos.use`. El PIN (4–6 cifras) se guarda con scrypt y sal en `pos_staff_pins`, tabla sin `GRANT` para `app_user`: solo se lee a través de funciones `SECURITY DEFINER` que exigen el token del terminal. Cinco fallos seguidos lo bloquean cinco minutos.
3. **Turno.** Tras el PIN, una cookie firmada con HMAC (`POS_SESSION_SECRET`) dice quién usa el terminal (12 h como máximo, bloqueo por inactividad). En cada petición se vuelve a resolver el terminal y la membresía, y la transacción corre como ese usuario: **la RLS es la misma que en el backoffice**.

El PIN de un propietario solo lo cambia otro propietario: sin esa regla, un encargado podría ponerse en su lugar en la tablet.

### Permisos y roles

| Permiso | Quién | Qué |
|---|---|---|
| `pos.use` | Camarero | Mesas, comandas, envío a cocina, pre-ticket y cobro |
| `pos.manage` | Encargado, Administración | Además: abrir y cerrar caja, retiradas, descuentos, quitar lo enviado a cocina, anular cuentas con consumiciones, carta, escandallos, recuentos, terminales y PIN |

El rol Camarero lleva también `invoicing.write/issue` e `inventory.post`, porque la RLS de facturas y movimientos de stock los exige para emitir el ticket y descontar existencias. Esos permisos le dejarían crear facturas en el backoffice si tuviera cuenta allí; en la práctica, el camarero solo entra en la tablet con su PIN.

Las reglas que protegen la caja viven en triggers, no en la interfaz: las líneas solo cambian con la cuenta abierta, el precio y el artículo de una línea no se reescriben, y una cuenta o una caja cerrada es inmutable.

### Cuentas y cobro

- La línea de una cuenta la identifica el terminal con un UUID y se envía como «cantidad = N». Reintentar tras un corte no duplica nada. El cliente nunca manda precios: los lee el servidor de la carta (`app.pos_menu`).
- `checkout` hace todo en una transacción: ticket F2 en la serie simplificada del año (`app.issue_invoice`, con su huella), salida de stock con escandallos, cobro en la caja abierta del terminal y cierre de la cuenta. Cobrar dos veces la misma cuenta devuelve el mismo ticket.
- **Redondeo.** `invoice_lines` redondea base y cuota por línea. Con IVA del 10 %, agrupar consumiciones puede descuadrar la carta: 2 gin-tonics de 8 € agrupados darían 16,01 €. `buildTicketLines` agrupa lo que cuadra y separa en unidades lo que no. El navegador usa el mismo módulo, así que el total que ve el camarero es el que se emite (el cobro comprueba que coinciden).

### Escandallos y stock

`recipe_lines` vincula un producto de carta con sus ingredientes (artículos inventariables), en la unidad de cada ingrediente. Al cobrar, `postSaleConsumption` descuenta los ingredientes de los productos con escandallo (sumados por ticket) y el propio artículo en los productos de unidad. El coste es el coste medio ponderado que mantiene el libro de stock con cada albarán.

**Stock negativo** (`organizations.settings.allow_negative_stock`, Ajustes › TPV): en una barra no se puede dejar de cobrar porque el inventario no cuadre. Sustituye a la `CHECK on_hand >= 0`, que pasa a comprobar el trigger del libro (el único que escribe `stock_levels`). Sin el ajuste, todo funciona como antes.

### Formato de compra

El stock se lleva siempre en la unidad en que se vende o se gasta (ud, l, kg). Cada artículo puede tener un formato de compra (`purchase_unit`, `purchase_pack_size`: «caja» de 24). Al crear el artículo se deduce del nombre («Agua 50 cl (caja 24)», «24x33cl»; `apps/web/src/lib/pack-detect.ts`).

- **Albaranes**: cada línea va en cajas o en unidades (`goods_receipt_lines.pack_size`, congelado al crearla; el trigger solo admite 1 o el formato del artículo). Al contabilizar entran `cantidad × pack_size` unidades a `coste ÷ pack_size`.
- **Ajustes y recuentos**: el formulario (backoffice) y el recuento de la TPV («3 cajas y 5 sueltas») convierten a unidades antes de enviar.
- **Artículos antiguos en cajas**: `app.convert_stock_unit` pasa existencias, coste medio, mínimos y escandallos a la unidad nueva en una transacción. Cambiar la unidad a mano con movimientos está bloqueado.

### Caja

Una caja abierta por terminal (índice único). Al abrirla se registra el fondo; las retiradas y entradas quedan en `cash_movements`, que solo admite altas. El cierre (`app.close_cash_session`) **calcula lo esperado en la base de datos** (fondo + efectivo + entradas − retiradas), guarda el conteo por billetes y monedas, la diferencia y el reporte Z congelado, y rechaza el cierre si quedan cuentas abiertas. Mientras la caja está abierta, `app.cash_session_summary` da el reporte X en vivo.

### Pendiente

| Tema | Estado |
|---|---|
| Modo sin conexión | Hay reintentos idempotentes ante cortes breves. Para cobrar sin red hace falta una cola local y una serie de tickets por terminal (numerar sin consultar al servidor). |
| Dividir cuenta y pagos mixtos | Un ticket por cuenta y un solo medio de pago. |
| Cocina | «Enviar a cocina» marca las líneas; falta la impresora de comandas o la pantalla de cocina. |
| Impresora de tickets | Se imprime con el diálogo del navegador (formato 80 mm). Para ESC/POS directo hace falta un puente local o Capacitor. |
| Tiempo real | Las mesas se refrescan cada 5 s entre terminales. |

---

## 10. Tarjetas digitales de empleado (Apple Wallet / Google Wallet)

El empleado lleva en el móvil una tarjeta con un QR. El TPV la lee y aplica a la cuenta el descuento de empleado de su rol.

| Pieza | Dónde |
|---|---|
| Esquema, RLS, funciones y triggers | `supabase/migrations/20261104000024_staff_cards.sql` |
| Dominio: formato del QR, TOTP (RFC 6238), contratos | `packages/staff-cards/src/domain/` |
| Casos de uso | `packages/staff-cards/src/application/staff-card.service.ts` |
| .pkpass (firma PKCS#7), Google Wallet (JWT + REST), APNs, cifrado | `packages/staff-cards/src/infrastructure/` |
| Endpoint del TPV | `apps/tpv/src/app/api/v1/discounts/validate-qr/route.ts` |
| Backoffice, web service de Apple y cron | `apps/web/src/app/api/v1/staff-cards/…`, `api/wallet/apple/v1/[...path]`, `api/cron/wallet-updates` |
| Pruebas | `packages/staff-cards/src/**/*.test.ts` (24) · `tests/integration/staff-cards.test.ts` (16) |

### Flujo

```
Backoffice (staff_cards.manage)         Móvil del empleado              TPV (pos.use)                 Postgres
  POST /api/v1/staff-cards ───────────────────────────────────────────────────────────────────────► employee_cards (secreto cifrado)
  GET  …/apple  → .pkpass firmado ──► Apple Wallet (QR estático)
  GET  …/google → enlace «Añadir» ──► Google Wallet (QR TOTP cada 30 s)
                                     enseña el QR ─────────► lector/cámara
                                                             POST /api/v1/discounts/validate-qr
                                                               1. parseQr (formato)          sin tocar la base
                                                               2. app.staff_card(id, pos)  ─► ¿de esta empresa?
                                                               3. verifyCode (Apple: secreto; Google: TOTP ±30 s)
                                                               4. PIN del titular (si la política lo pide; bloqueo a los 5 fallos)
                                                               5. app.pos_apply_staff_card ─► bloquea tarjeta y cuenta; estado, membresía,
                                                                                             autoservicio, código ya usado, límites;
                                                                                             crea el uso y pone el % en todas las líneas
                                                             cobro normal (payTab) ─────────► trigger: el uso queda «redeemed» con € reales
```

El cliente nunca manda el porcentaje: lo fija `staff_discount_policies` (por rol, con una general de respaldo).

### Decisión de producto (noviembre de 2026)

Las tarjetas se emiten como **estándar: QR fijo y definitivo** (internamente `wallet = 'apple'`), una por persona; reemitir revoca la anterior. El empleado la enseña desde *Ajustes › Tarjetas de empleado* en el móvil (tarjeta de cristal; al tocarla, a pantalla completa). Como una foto del QR también valdría, la política pide por defecto el **PIN del titular** en el TPV. No se ofrece guardarla en Apple/Google Wallet; la generación de pases oficiales (.pkpass, Google Wallet con QR dinámico, web service de Apple, cola de avisos) sigue implementada y probada en el servidor, sin uso en la interfaz.

### Fichar con la tarjeta (migración `0025_card_clock`)

La misma tarjeta sirve para el registro de jornada. En la **pantalla de bloqueo del TPV** el botón *Fichar con tarjeta* abre: escanear → «Marta Ortega · Estás fuera de turno» → *Fichar entrada* (o *salida* / *pausa*, según su estado) → **PIN del titular, siempre** → «Entrada registrada · 22:03».

- No hace falta turno abierto: la tablet se identifica con su token y la persona con tarjeta + PIN (`app.pos_card_lookup`, `app.pos_card_clock`, DEFINER). Con un QR fijo, una foto bastaría para fichar por otro; el PIN lo impide.
- Fichaje en `time_entries` con `source = 'kiosk'`, `created_by` = titular y `device_info` (terminal, tarjeta, `card+pin`). Inmutable como todos; se corrige con un fichaje manual de RRHH. En *RRHH › Registro* aparece como «(tarjeta)».
- Estado = último fichaje de las **últimas 16 horas**, no del día: un turno de noche (22:00 → 04:00) se cierra bien. Una entrada olvidada de hace más de 16 h no bloquea fichar hoy (la corrige RRHH).
- Puede fichar cualquiera con tarjeta, PIN y permiso `hr.time.self` (todos los roles base), aunque no use el TPV.

### Antifraude

| Amenaza | Defensa |
|---|---|
| Captura de pantalla (Google) | QR rotativo TOTP de 30 s, cada código vale una vez (`last_totp_step`) y `screenshotEligibility: INELIGIBLE` (Android). |
| Captura de pantalla (Apple) | Apple Wallet **no admite QR rotativos**: el QR es estático. Por eso la política exige por defecto el **PIN del titular** en el TPV (`require_pin`), con bloqueo tras 5 fallos. Además, `sharingProhibited` impide reenviarlo por AirDrop. |
| Camarero que se aplica su tarjeta, o se la pasa a un amigo | `allow_self_service = false`: la tarjeta no la puede aplicar quien maneja el TPV. Cada uso queda con titular, operador, terminal y ticket. |
| Abuso repetido | `max_uses_per_day` y `monthly_discount_cap` por persona (no por tarjeta), comprobados con la tarjeta bloqueada `FOR UPDATE`. |
| QR falsificado o de otra empresa | Secreto de 256 bits / semilla TOTP por tarjeta, comparación en tiempo constante; una tarjeta de otra empresa responde igual que una inexistente. |
| Volcado de la base | Secretos cifrados con AES-256-GCM y una clave que solo tiene la aplicación (`STAFF_CARD_SECRET_KEY`); `app_user` no tiene `SELECT` sobre esa columna. |
| Baja de un empleado | Al suspender la membresía, un trigger revoca sus tarjetas **en la misma transacción**. |

### Revocación y actualización de pases

Revocar o cambiar algo es inmediato en la base: la siguiente lectura en el TPV ya falla. Avisar al móvil va aparte, mediante una cola (*transactional outbox*):

1. Cualquier cambio visible (revocar, cambio de política o de rol) sube `employee_cards.version`, y un trigger encola el aviso en `wallet_pass_updates`, en la misma transacción.
2. `processWalletUpdates` reparte la cola (`FOR UPDATE SKIP LOCKED`, varios procesos a la vez):
   - **Apple:** push vacío por APNs (HTTP/2, certificado del Pass Type ID). El móvil pregunta al web service qué ha cambiado y descarga el pase nuevo; una tarjeta revocada llega con `voided: true` y sin QR.
   - **Google:** `PUT genericObject` con `state: INACTIVE` y sin QR.
3. Se ejecuta al momento tras emitir, revocar o cambiar la política (`after()` de Next) y, para los reintentos, en `GET /api/cron/wallet-updates` (cron de Vercel con `CRON_SECRET`). Hasta 8 intentos por aviso.

### Configuración

| Variable | Para |
|---|---|
| `STAFF_CARD_SECRET_KEY` | Obligatoria. 32 bytes en base64 (`openssl rand -base64 32`), **la misma en backoffice y TPV**. |
| `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT_PEM`, `APPLE_PASS_KEY_PEM` (+ `_PASSPHRASE`), `APPLE_WWDR_PEM` | Apple Wallet. Requiere Apple Developer Program (99 $/año) y un certificado «Pass Type ID». |
| `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SA_EMAIL`, `GOOGLE_WALLET_SA_KEY` | Google Wallet. Cuenta de emisor (gratis) y cuenta de servicio. |
| `WALLET_PUBLIC_URL` | URL pública HTTPS del backoffice (web service de Apple y logo de Google). |
| `CRON_SECRET` | Protege el cron de la cola. |

### Pendiente

| Tema | Estado |
|---|---|
| Pantallas | Faltan el botón «Tarjeta de empleado» en la cuenta del TPV (lectura con pistola USB/Bluetooth o con la cámara de la tablet, más teclado de PIN) y la gestión de tarjetas y políticas en el backoffice. La API ya está. |
| Probar con Apple y Google reales | La firma del .pkpass está verificada con OpenSSL frente a una CA de pruebas, y el JWT de Google con su clave pública. Falta probarlos con los certificados reales y en un iPhone/Android. |
| Cabeceras APNs | Se envía `apns-topic` = Pass Type ID con payload `{}`; confirmar contra la documentación vigente de Wallet al dar de alta el certificado. |
| Cron en Vercel Hobby | Solo permite una ejecución al día; los avisos inmediatos van con `after()`. Para reintentos frecuentes, plan Pro o un cron externo. |
