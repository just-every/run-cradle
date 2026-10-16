// Every string and command on Cradle's Run page (run-cradle.com/run).
import type { RunData } from '../base/run-site'

export const run: RunData = {
  name: 'Cradle',
  repository: 'https://github.com/just-every/run-cradle',
  clone: 'git clone https://github.com/just-every/run-cradle.git cradle',
  folder: 'cradle',
  requirements: 'Runs on macOS, Linux or Windows with WSL2. Rer installs the pinned Node and pnpm for you. Local setup is optional after rer dev. To host it, deploy with OWNER_EMAIL; rer claims that owner automatically, then you sign in by email. No manual setup token is needed.',
  licence: 'MIT',
  docs: true,
  hosted: [],
}
