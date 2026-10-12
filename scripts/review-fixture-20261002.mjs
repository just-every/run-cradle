import { installLegacyFixture } from '../tests/helpers/install-legacy-fixture.mjs'
console.log(await installLegacyFixture(process.cwd() + '/.wrangler/review'))
