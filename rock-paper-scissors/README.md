# rock-paper-scissors

Aplicación móvil web progresiva desarrollada con **JavaScript + Lit + Babel** usando **decoradores**. Permite registrar jugadores por nombre, continuar partidas existentes, persistir el estado localmente y funcionar offline después de la primera carga.

## Características

- Ruta `home` por defecto
- Ruta `game`
- Redirección automática de rutas no válidas a `/`
- Persistencia de jugadores y estado de la sesión
- Continuación de partida al reusar un nombre existente
- PWA con `manifest` y `service worker`
- Soporte offline tras la primera apertura
- Tests unitarios de vistas, componentes y dominio
- Preparada para despliegue en Vercel

## Stack

- JavaScript
- Lit
- Babel
- Vite
- Vitest
- Open WC Testing

## Instalación

```bash
npm install