import { withDemo } from '../vendor/base/modules/demo/index.mjs'
import { seedDemo } from './demo'
import worker from './core/app/worker'
export { InstallationCoordinator } from './core/platform/installation.server'
export default withDemo(worker, { seed: seedDemo })
