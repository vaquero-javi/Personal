# Product

<!-- impeccable:product-schema 1 -->

> Fuente: brief técnico entregado por el usuario el 2026-10-25 (sustituye a la entrevista de `init`).
> Lo marcado como *[inferido]* no aparece literal en el brief y debe confirmarse.

## Platform

web

La misma aplicación web se distribuye como PWA (escritorio), y empaquetada con Capacitor para iOS y Android. El lenguaje de diseño es web; no hay UI nativa por plataforma.

## Stack

Fijado por el brief:

- PostgreSQL obligatorio (integridad relacional, ACID, contabilidad). Fase inicial: Supabase (Postgres + Auth). Enterprise: Postgres administrado (AWS RDS Aurora / GCP Cloud SQL) en VPC privada.
- Aislamiento por empresa con Row Level Security nativo (`organization_id`).
- Backend Node.js + TypeScript con Clean Architecture / DDD (Next.js Route Handlers / Server Actions; NestJS como alternativa).
- Frontend React / Next.js + Tailwind CSS, mobile-first.
- TanStack Query para estado asíncrono; Zod para validación en runtime.

Decisiones delegadas y tomadas: ver `docs/arquitectura.md` (monorepo npm workspaces + Turborepo, driver `postgres.js`, Capacitor para móvil).

## Users

- **Dueños y gerentes de PyMEs**: gestionan su empresa de punta a punta (ventas, compras, stock, facturación, personal) desde una sola herramienta.
- **Responsables de holdings y grupos de sociedades**: gestionan varias razones sociales a la vez, ya sea cada una por separado o en vista consolidada, y cambian de sociedad al momento.
- **Personal operativo** *[inferido]*: empleados que fichan, mozos de almacén que registran albaranes y comerciales que registran ventas, a menudo desde el móvil.

## Product Purpose

ERP/CRM modular y multiempresa que reúne en una sola plataforma segura y parametrizable los fichajes y RRHH, la facturación con cumplimiento fiscal, las compras y proveedores, las ventas (TPV/B2B), el almacén y las incidencias.

## Positioning

Una cuenta, muchas sociedades. El aislamiento entre empresas lo garantiza la base de datos (RLS) y no solo la aplicación. El cumplimiento fiscal español (VeriFactu / TicketBAI) forma parte del núcleo, no es un añadido.

## Operating Context

- Cambio de contexto empresarial frecuente; vistas consolidadas de grupo.
- Fichaje desde el móvil con geolocalización opcional.
- Recepción de mercancía contra el albarán del proveedor en el almacén.
- Emisión de facturas encadenadas (huella) y su envío a la AEAT o a las haciendas forales.

## Capabilities and Constraints

Módulos: Fichajes y RRHH (control horario, turnos, vacaciones, permisos) · Facturación (emitidas/recibidas, cobros, impuestos, VeriFactu/TicketBAI) · Compras y proveedores (pedidos, pagos, costes) · Ventas TPV/B2B (stock en tiempo real, multitarifa, historial) · Almacén básico (entradas, salidas, multialmacén, ajustes, alertas de stock mínimo) · Incidencias · Multiempresa con RBAC granular.

Sin decidir: modelo de precios, si se permite stock negativo por empresa, proveedor de firma para TicketBAI y alcance del modo offline en móvil.

## Evidence on Hand

Ninguna todavía: no hay clientes, testimonios, métricas ni marca registrada. No inventarlos.

## Product Principles

1. La integridad de los datos está por encima de la comodidad: las reglas críticas (aislamiento, stock y numeración) viven en la base de datos.
2. Lo fiscal y lo laboral no se edita, se corrige con registros nuevos.
3. Parametrizable sin bifurcar el código: cada empresa añade campos y roles sin migraciones.
4. Una sola base de código para todas las plataformas.
