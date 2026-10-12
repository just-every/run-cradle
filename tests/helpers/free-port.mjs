import {createServer} from 'node:net'

/** A loopback port the kernel just handed out, so concurrent jobs on one machine never share a listener. */
export async function freePort(){
 const server=createServer()
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
 const {port}=server.address()
 await new Promise(resolve=>server.close(resolve))
 return port
}
