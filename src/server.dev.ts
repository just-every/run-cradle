// Local-only Worker entry. vite.config.ts loads it only for `vite dev`; the deployed
// main stays src/core/app/worker.ts, and `rer build` refuses any output that contains
// the dev layer. It adds dev sign-in, personas and the dev badge around the same Worker.
import worker from './server'
import { withDevIdentity as withCliIdentity } from '@runeditrun/rer/modules/operator-auth/dev'
import { withDevIdentity } from '../vendor/base/modules/operator-auth/dev/index.mjs'
import { baseAuthConfig } from './core/platform/base-auth.server'
import { devPersonas } from './core/platform/dev-personas'
import { localRuntimeBindings } from './core/platform/local-auth.server'
import type { PlatformBindings } from './core/platform/bindings'

export { InstallationCoordinator } from './core/platform/installation.server'
const options = { bindings: localRuntimeBindings, config: baseAuthConfig, personas: devPersonas }
const localWorker = withDevIdentity<PlatformBindings, typeof worker>(worker, options)
const cliWorker = withCliIdentity<PlatformBindings, typeof worker>(worker, options)
export default {
  ...localWorker,
  fetch(...[request, env, execution]: Parameters<typeof localWorker.fetch>) {
    // rer 0.2.20's owner proof stays local; the recorded Base copy owns the
    // persona controls and ordinary dev sessions used by this product.
    return new URL(request.url).pathname === '/auth/local/cli-session'
      ? cliWorker.fetch(request, env, execution)
      : localWorker.fetch(request, env, execution)
  },
}
