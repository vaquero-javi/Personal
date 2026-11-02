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
Lucía (propietaria de todas las sociedades), Carmen (administración; encargada en el bar), Marta e Iván (empleados; camareros en el bar), Rubén (empleado en dos sociedades).

### TPV de hostelería (`apps/tpv`)

App aparte para la tablet de la barra, sobre la misma base de datos: el stock, los tickets y la caja se ven en el backoffice.

```bash
cd apps/tpv && npx next dev -p 3200      # en una tercera terminal; usa apps/tpv/.env.local
```

1. Abre http://localhost:3200 y vincula el terminal con el código **`TAPA-2026`** (el del bar de ejemplo, de un solo uso).
   Para otra tablet, genera un código en el backoffice: *Bar La Plaza › Ajustes › TPV › Nuevo código*.
2. Entra con tu PIN: Lucía `1111` (propietaria), Carmen `2222` (encargada), Marta `3333` e Iván `4444` (camareros).

El camarero ve mesas, comandas y cobro; el encargado, además, caja (apertura, retiradas, arqueo y reporte Z), carta con food cost, escandallos y stock.

Para registrar albaranes con foto, añade `ANTHROPIC_API_KEY=<tu clave>` a `apps/web/.env.local` y reinicia la app. Sin la clave, esa opción aparece desactivada y el albarán se escribe a mano.

`npm run db:reset` borra los datos locales y vuelve a sembrar (las fechas de ejemplo son relativas a hoy).

## Pruebas

```bash
npm run db:test                              # esquema: RLS, FKs compuestas, stock, facturación, RBAC, nóminas, TPV (85)
npx vitest run --root packages/inventory     # albaranes, lectura de fotos y justificante: unitarias + integración (22)
npx vitest run --root packages/pos           # importes del ticket con la misma aritmética que Postgres (9)
npm run test:integration                     # servicios de TPV (terminal, PIN, cobro, escandallos, caja), ventas, compras, fichajes y permisos (22)
npm run db:reset && npm run e2e -w @omnia/web   # 17 flujos completos en el navegador (con la app arrancada)
npm run db:reset                             # después: los flujos dejan datos «(prueba)» en la base local
```

El flujo del albarán con foto no llama a la API: arranca la app para las pruebas con una lectura grabada,
`OMNIA_SCAN_FIXTURE="$PWD/e2e/fixtures/albaran-leido.json" npx next dev -p 3100` (en `apps/web`; se ignora en producción).

## Producción (Supabase)

1. Aplica `supabase/migrations/` (incluida la `…_supabase.sql`) en el proyecto.
2. Crea la contraseña del rol `omnia_api` y usa su cadena de conexión del pooler como `DATABASE_URL`.
3. Configura `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AUTH_ISSUER`, `AUTH_JWKS_URL` y `APP_URL` (ver `.env.example`) y quita `AUTH_MODE=dev`.
4. Para entrar con Google, activa el proveedor en Supabase Auth y añade `<APP_URL>/auth/callback` a las URL de redirección.
