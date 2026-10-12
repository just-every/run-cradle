// Local-only Worker entry. vite.config.ts loads it only for `vite dev`; the deployed
// main stays src/core/app/worker.ts, and `rer build` refuses any output that contains
// the dev layer. It adds dev sign-in, personas and the dev badge around the same Worker.
import worker from './core/app/worker'
import { withDevIdentity } from '../vendor/base/modules/operator-auth/dev/index.mjs'
import { baseAuthConfig } from './core/platform/base-auth.server'
import { devPersonas } from './core/platform/dev-personas'
import { localRuntimeBindings } from './core/platform/local-auth.server'
import type { PlatformBindings } from './core/platform/bindings'

export { InstallationCoordinator } from './core/platform/installation.server'
export default withDevIdentity<PlatformBindings, typeof worker>(worker, { bindings: localRuntimeBindings, config: baseAuthConfig, personas: devPersonas })
