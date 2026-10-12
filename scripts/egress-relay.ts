import { createServer } from 'node:http'
import { createRelayHandler } from './egress/handler.ts'

const port=Number(process.env.EGRESS_RELAY_PORT??'8789'),secret=process.env.EGRESS_RELAY_SECRET??''
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Relay port must be valid')
const server=createServer(createRelayHandler(secret))
server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=40
server.listen(port,'127.0.0.1',()=>process.stdout.write(`Cradle egress relay listening on loopback port ${port}\n`))
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{server.close();server.closeAllConnections()})
