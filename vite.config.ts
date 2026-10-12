import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { archiveOutputGuard } from './scripts/base-onboarding/archive-output.mjs'

// Only `vite dev` loads the local-only entry and the checkout's dev key; a build
// keeps the deployed main and never sees either (rer build checks its output).
const local = (name: string) => process.env[name] ? { [name]: process.env[name] } : {}
const serve = { main: './src/server.dev.ts', vars: { ...local('RER_DEV_ORIGIN'), ...local('RER_DEV_KEY'), ...local('RER_DEV_IDENTITY') } }

export default defineConfig(({ command, isPreview }) => ({
  server: {
    fs: {
      strict: true,
      // Cloudflare's Worker runner fetches these modules before Vite records
      // their imports in the module graph.
      allow: ['src', 'public', 'node_modules', 'vendor/base/modules', 'seed.json', 'sample-data/cradle.json'],
      deny: ['**/.rer/**', '**/.seed/**', '**/exports/**', '**/*.rer'],
    },
  },
  plugins: [
    cloudflare({ inspectorPort: false, viteEnvironment: { name: 'ssr' }, persistState: { path: process.env.CRADLE_PERSIST_PATH || '.wrangler/state' },
      ...(command === 'serve' && !isPreview ? { config: serve } : process.env.RER_DEV_ORIGIN ? { config: { vars: local('RER_DEV_ORIGIN') } } : {}),
    }),
    tanstackStart({ prerender: { enabled: false, autoStaticPathsDiscovery: false, crawlLinks: false } }),
    react(),
    tailwindcss(),
    // Refuses any installation archive in the written client and Worker output.
    archiveOutputGuard(),
  ],
}))
