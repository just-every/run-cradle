import { demoSockets } from './src/modules/demo/vite.mjs'
import {createHash} from 'node:crypto'
import {readdirSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { docsSite } from './src/core/features/docs/build/plugin.ts'
import { archiveOutputGuard } from '@runeditrun/rer/archive-output'

// Only `vite dev` loads the local-only entry and the checkout's dev key; a build
// keeps the deployed main and never sees either (rer build checks its output).
const local = (name: string) => process.env[name] ? { [name]: process.env[name] } : {}
const serve = { main: './src/server.dev.ts', vars: { ...local('RER_DEV_ORIGIN'), ...local('RER_DEV_KEY'), ...local('RER_DEV_IDENTITY'), ...local('RER_DEMO'), ...local('RER_DEMO_EXPIRES') } }

const launchSourceHash=createHash('sha256')
for(const root of ['src/apps/launch','src/core/app/composition','src/domains/channels'])for(const name of readdirSync(root,{recursive:true}).map(String).filter(name=>name.endsWith('.ts')).sort()){launchSourceHash.update(join(root,name));launchSourceHash.update(readFileSync(join(root,name)))}
const launchSourceRelease=`sha256:${launchSourceHash.digest('hex')}`

export default defineConfig(({ command, isPreview }) => ({
  define:{__LAUNCH_SOURCE_RELEASE__:JSON.stringify(launchSourceRelease)},
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
    demoSockets(),
    cloudflare({ inspectorPort: false, viteEnvironment: { name: 'ssr' }, persistState: { path: process.env.RER_STATE_DIR || process.env.CRADLE_PERSIST_PATH || '.wrangler/state' },
      ...(command === 'serve' && !isPreview ? { config: serve } : process.env.RER_DEV_ORIGIN ? { config: { vars: local('RER_DEV_ORIGIN') } } : {}),
    }),
    docsSite(),
    tanstackStart({ prerender: { enabled: false, autoStaticPathsDiscovery: false, crawlLinks: false } }),
    react(),
    tailwindcss(),
    // Refuses any installation archive in the written client and Worker output.
    archiveOutputGuard(),
  ],
}))
