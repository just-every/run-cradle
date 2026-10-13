// Every string and command on Cradle's Run page (run-cradle.com/run).
import type { RunData } from '../base/run-site'

export const run: RunData = {
  name: 'Cradle',
  repository: 'https://github.com/just-every/run-cradle',
  clone: 'git clone https://github.com/just-every/run-cradle.git cradle',
  folder: 'cradle',
  requirements: 'Needs Node 22 or later and pnpm 10.12.4, on macOS, Linux or Windows with WSL2.',
  licence: 'MIT',
  docs: true,
  hosted: [],
}
