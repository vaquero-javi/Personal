# Omnia

ERP/CRM modular y multiempresa para PyMEs y grupos de sociedades: ventas (B2B y TPV), compras, almacén, facturación (VeriFactu/TicketBAI), fichajes y RRHH, e incidencias.

- Producto: [`PRODUCT.md`](PRODUCT.md)
- Sistema visual («Archivador AZ»): [`DESIGN.md`](DESIGN.md)
- Arquitectura, modelo de datos, multitenencia y RLS: [`docs/arquitectura.md`](docs/arquitectura.md)

## Arrancar en local

No hace falta Docker ni Supabase: la base de datos es Postgres embebido (PGlite).

```bash
npm install
npm run db:dev                          # Postgres en 127.0.0.1:54329 con migraciones y datos de ejemplo
cd apps/web && npx next dev -p 3100     # en otra terminal; usa apps/web/.env.local (AUTH_MODE=dev)
```

Abre http://localhost:3100/entrar y elige una persona de ejemplo. Cada una tiene un rol distinto:
Lucía (propietaria del holding Grupo Albar y de sus cuatro sociedades; en el bar hay dos empresas: Bar La Plaza y Cafetería Centro, e Iván trabaja en las dos), Carmen (administración; encargada en el bar), Marta e Iván (empleados; camareros en el bar), Rubén (empleado en dos sociedades).

### Panel del equipo de Omnia (`apps/admin`)

App aparte, solo para quien gestiona Omnia: decide qué módulos tiene cada sociedad. Se llega con el botón **Equipo Omnia** de la portada (arriba a la derecha) y pide **email y contraseña propios del panel**: no sirven las cuentas de las empresas.

```bash
cd apps/admin && npx next dev -p 3300      # usa apps/admin/.env.local
```

En local: **`equipo@omnia.local`** / **`equipo-omnia-local`**. Para cambiarla: `npm run admin:password -- equipo@omnia.local --local`.

Producción, una vez: tu usuario en `public.platform_admins`, la contraseña con `npm run admin:password -- <tu email>` (muestra el SQL para Supabase), el rol `omnia_admin` con contraseña (`alter role omnia_admin with password '…'`) y su cadena del pooler como `DATABASE_URL` del panel, `ADMIN_SESSION_SECRET` (`openssl rand -base64 32`) y `ADMIN_APP_URL` en la web.

### TPV de hostelería (`apps/tpv`)

App aparte para la tablet de la barra, sobre la misma base de datos: el stock, los tickets y la caja se ven en el backoffice.

```bash
cd apps/tpv && npx next dev -p 3200      # en una tercera terminal; usa apps/tpv/.env.local
```

1. Abre http://localhost:3200 y vincula el terminal con el código **`TAPA-2026`** (el del bar de ejemplo, de un solo uso).
   Para otra tablet, genera un código en el backoffice: *Bar La Plaza › Ajustes › TPV › Nuevo código*.
2. Entra con tu PIN: Lucía `1111` (propietaria), Carmen `2222` (encargada), Marta `3333` e Iván `4444` (camareros).

El camarero ve mesas, comandas y cobro; el encargado, además, caja (apertura, retiradas, arqueo y reporte Z), carta con food cost, escandallos y stock.

Para registrar albaranes y facturas de proveedor con foto o PDF, añade a `apps/web/.env.local` una clave de lectura y reinicia la app: `GEMINI_API_KEY=<tu clave>` (Google AI Studio, con plan gratuito) o `ANTHROPIC_API_KEY=<tu clave>` (Claude; si están las dos, se usa esta). Sin ninguna, esa opción aparece desactivada y se escriben a mano.

`npm run db:reset` borra los datos locales y vuelve a sembrar (las fechas de ejemplo son relativas a hoy).

## Pruebas

```bash
npm run db:test                              # esquema: RLS, FKs compuestas, stock, facturación, RBAC, nóminas, TPV (96) + módulos contratados y acceso del panel (62) + holding, sociedades, empresas y mensajes (49)
npx vitest run --root packages/inventory     # albaranes, lectura de fotos y justificante: unitarias + integración (22)
npx vitest run --root packages/pos           # importes del ticket con la misma aritmética que Postgres (9)
npm run test:integration                     # servicios de TPV, ventas, compras, fichajes, permisos y módulos contratados
npx vitest run --root packages/entitlements  # reglas de módulos (réplica en TS de la RLS) (7)
npx vitest run --root apps/admin             # contraseñas y sesión firmada del panel (8)
npm run db:reset && npm run e2e -w @omnia/web   # 17 flujos completos en el navegador (con la app arrancada)
npm run db:reset                             # después: los flujos dejan datos «(prueba)» en la base local
```

El flujo del albarán con foto no llama a la API: arranca la app para las pruebas con una lectura grabada,
`OMNIA_SCAN_FIXTURE="$PWD/e2e/fixtures/albaran-leido.json" npx next dev -p 3100` (en `apps/web`; se ignora en producción).
Lo mismo para registrar una factura recibida con foto (*Compras › Facturas recibidas*): `OMNIA_INVOICE_SCAN_FIXTURE="$PWD/e2e/fixtures/factura-leida.json"`.

## Producción (Supabase)

1. Aplica `supabase/migrations/` (incluida la `…_supabase.sql`) en el proyecto.
2. Crea la contraseña del rol `omnia_api` y usa su cadena de conexión del pooler como `DATABASE_URL`.
3. Configura `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AUTH_ISSUER`, `AUTH_JWKS_URL` y `APP_URL` (ver `.env.example`) y quita `AUTH_MODE=dev`.
4. Para entrar con Google, activa el proveedor en Supabase Auth y añade `<APP_URL>/auth/callback` a las URL de redirección.
