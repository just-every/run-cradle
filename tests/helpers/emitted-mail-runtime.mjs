import {emittedRuntime,emittedOptions} from './emitted-runtime.mjs'
import {createFixtureMail} from './fixture-mail.mjs'

/** Start workerd before allocating its port-keyed, process-owned mail capture. */
export async function emittedMailRuntime(directory,port,bindings,networkEdge,options){
 let runtime,mail
 try{
  runtime=await emittedRuntime(directory,port,bindings,request=>mail.fetch(request),options)
  const listener=await runtime.ready
  port=Number(listener.port)
  mail=await createFixtureMail(port,networkEdge)
  bindings={...bindings,APP_ORIGIN:listener.origin,...mail.bindings}
  await runtime.setOptions(await emittedOptions(directory,port,bindings,request=>mail.fetch(request),options))
  return {runtime,mail,origin:listener.origin,port,bindings}
 }catch(error){try{await runtime?.dispose()}finally{await mail?.close()}throw error}
}
