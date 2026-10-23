import { parseArgs } from 'node:util'
import { emittedRuntime } from './emitted-runtime.mjs'
import { emittedMailRuntime } from './emitted-mail-runtime.mjs'

const { values } = parseArgs({ options: {
  port: { type: 'string', default: '0' },
  'persist-to': { type: 'string', default: '.wrangler/state' },
  var: { type: 'string', multiple: true, default: [] },
} })
const bindings = {}
for (const value of values.var) {
  const separator = value.indexOf(':')
  if (separator < 1) throw new Error('Use --var NAME:value')
  bindings[value.slice(0, separator)] = value.slice(separator + 1)
}
let runtime,mail
try{
 if(bindings.MAIL_PROVIDER==='development')({runtime,mail}=await emittedMailRuntime(values['persist-to'],Number(values.port),bindings))
 // The unconfigured-health fixture must retain absent required bindings.
 else runtime=await emittedRuntime(values['persist-to'],Number(values.port),bindings)
}
catch(error){await mail?.close();throw error}
let closing
const close=()=>closing??=(async()=>{
 let failed=false
 try{await runtime.dispose()}catch{failed=true}
 try{await mail?.close()}catch{failed=true}
 process.exit(failed?1:0)
})()
process.on('SIGINT',close)
process.on('SIGTERM',close)
try{console.log(`Emitted Worker listening at ${await runtime.ready}`)}
catch(error){try{await runtime.dispose()}finally{await mail?.close()}throw error}
