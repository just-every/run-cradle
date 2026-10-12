let requests=0
const original=globalThis.fetch
// Only the unpaid network edge is doubled. Build and packaging stay real.
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 if(['http:','https:'].includes(url.protocol)&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){requests++;throw new Error('Offline provider access refused')}
 return original(input,init)
}
process.on('exit',()=>process.stderr.write(`CRADLE_OFFLINE_PROVIDER_REQUESTS ${requests}\n`))
