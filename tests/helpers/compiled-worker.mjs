import { parseArgs } from 'node:util'
import { emittedRuntime } from './emitted-runtime.mjs'

const { values } = parseArgs({ options: {
  port: { type: 'string', default: '4185' },
  'persist-to': { type: 'string', default: '.wrangler/state' },
  var: { type: 'string', multiple: true, default: [] },
} })
const bindings = {}
for (const value of values.var) {
  const separator = value.indexOf(':')
  if (separator < 1) throw new Error('Use --var NAME:value')
  bindings[value.slice(0, separator)] = value.slice(separator + 1)
}
const runtime = await emittedRuntime(values['persist-to'],Number(values.port),bindings)
let closing
const close=()=>closing??=runtime.dispose().then(()=>process.exit(0),()=>process.exit(1))
process.on('SIGINT',close)
process.on('SIGTERM',close)
console.log(`Emitted Worker listening at ${await runtime.ready}`)
