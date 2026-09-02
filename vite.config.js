import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'

// Fuera del modo local, los JSON con datos reales no entran al bundle.
// base44Client.js importa el modo local de forma estatica, asi que sin esto el
// build publico se llevaba src/api/local/datos.json — 1,2 MB con los correos de
// los funcionarios y el inventario completo. Un alias no basta: compat.js lo
// pide como './datos.json' y el alias actua sobre el especificador, no sobre la
// ruta resuelta. Por eso se intercepta mirando quien importa.
function sinDatosLocales(modoLocal) {
  const vacio = path.resolve(import.meta.dirname, 'src/api/local/datos-vacio.json')
  return {
    name: 'sin-datos-locales',
    enforce: 'pre',
    resolveId(fuente, importador) {
      if (modoLocal) return null
      const esJsonLocal = fuente === './datos.json' || fuente === './datos-prueba.json'
      const desdeLocal = importador?.split(path.sep).join('/').includes('/api/local/')
      return esJsonLocal && desdeLocal ? vacio : null
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // El modo local vive en `.env.demo` y se activa con `npm run dev:local`
  // (vite --mode demo). Asi `npm run build` nunca lo hereda por accidente:
  // antes estaba en `.env.local`, que Vite carga tambien al compilar — el
  // bundle de produccion habria creido estar en modo local.
  const MODO_LOCAL = loadEnv(mode, import.meta.dirname, '').VITE_MODO === 'local'

  return {
    logLevel: 'error', // Suppress warnings, only show errors
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        // Las funciones portadas importan '#compat'. En Railway lo resuelve
        // Node con el campo "imports" de servidor/package.json (-> Supabase);
        // aca lo resolvemos al almacen en memoria.
        '#compat': path.resolve(import.meta.dirname, 'src/api/local/compat.js'),
      },
    },
    plugins: [
      sinDatosLocales(MODO_LOCAL),
      base44({
        // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
        // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
        legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
        hmrNotifier: !MODO_LOCAL,
        navigationNotifier: !MODO_LOCAL,
        analyticsTracker: !MODO_LOCAL,
        visualEditAgent: !MODO_LOCAL,
      }),
      react(),
    ],
  }
})
