// Servidor de la app con datos de demo, para grabar el vídeo sin tocar Supabase.
// Uso (desde trailer/): npm run demo  → http://localhost:5299
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const here = path.dirname(fileURLToPath(import.meta.url))
const app = path.resolve(here, '../..')
const mock = path.join(here, 'supabase.ts')

export default defineConfig({
  root: app,
  envDir: here,
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://demo.chronos.app'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('demo'),
    'import.meta.env.VITE_VAPID_PUBLIC_KEY': JSON.stringify(''),
  },
  server: { port: 5299, strictPort: true },
  plugins: [
    {
      name: 'demo-supabase',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (!importer || importer === mock) return null
        if (/(^|\/)lib\/supabase(\.ts)?$/.test(source)) return mock
        return null
      },
    },
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      devOptions: { enabled: false },
      manifest: false,
    }),
  ],
})
