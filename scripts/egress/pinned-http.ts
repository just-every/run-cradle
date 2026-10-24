import {lookup} from 'node:dns/promises'
import {request} from 'node:https'
import {isIP} from 'node:net'
import {isPublicAddress,validateDestination} from '../../vendor/base/modules/integrations/core/destination.ts'
import type {RelayWire,RelayResponse} from '../../src/domains/integrations/relay-transport.server'

/** Seed-owned extension of the Base pinned transport for provider HTTP methods
 * and byte-preserving object transfers. Every DNS answer is checked; the chosen
 * public address is pinned while TLS still verifies the destination hostname. */
export class PinnedHttpTransport{
 async send(wire:RelayWire):Promise<RelayResponse>{
  const url=validateDestination(wire.url),host=url.hostname.replace(/^\[|\]$/g,''),timeout=5000
  let dnsTimer:ReturnType<typeof setTimeout>|undefined
  const addresses=await Promise.race([
   isIP(host)?Promise.resolve([{address:host,family:isIP(host)}]):lookup(host,{all:true,verbatim:true}),
   new Promise<never>((_resolve,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('DNS timeout')),timeout)}),
  ]).finally(()=>clearTimeout(dnsTimer))
  if(!addresses.length||addresses.some(value=>!isPublicAddress(value.address)))throw new Error('Destination DNS is not public')
  const pinned=addresses[0]!,body=Buffer.from(wire.body,wire.bodyEncoding==='base64'?'base64':'utf8')
  for(const name of Object.keys(wire.headers))if(/^(host|connection|transfer-encoding|content-length|proxy-authorization)$/i.test(name))throw new Error('Forbidden transport header')
  return new Promise((resolve,reject)=>{
   let settled=false,response:import('node:http').IncomingMessage|undefined,timer:ReturnType<typeof setTimeout>|undefined
   const fail=(error:Error)=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);response?.destroy();req.destroy()}
   const req=request(url,{method:wire.method??'POST',agent:false,rejectUnauthorized:true,headers:{...wire.headers,'content-length':body.length},lookup:(_hostname,options,callback)=>{if(options.all)callback(null,[pinned]);else callback(null,pinned.address,pinned.family)}},res=>{
    response=res
    if(settled){res.destroy();return}
    const chunks:Buffer[]=[];let size=0
    res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>(wire.bodyEncoding==='base64'?1048576:65536))fail(new Error('Response limit exceeded'));else chunks.push(chunk)})
    res.on('error',fail);res.on('aborted',()=>fail(new Error('Response aborted')))
    res.on('close',()=>{if(!res.complete)fail(new Error('Response incomplete'))})
    res.on('end',()=>{
     if(settled)return
     if(!res.complete){fail(new Error('Response incomplete'));return}
     settled=true;clearTimeout(timer)
     const headers:Record<string,string>={};for(const [name,value]of Object.entries(res.headers))if(value!==undefined)headers[name]=Array.isArray(value)?value.join(', '):value
     resolve({status:res.statusCode??0,headers,body:Buffer.concat(chunks).toString(wire.bodyEncoding==='base64'?'base64':'utf8'),...(wire.bodyEncoding?{bodyEncoding:wire.bodyEncoding}:{})})
    })
   })
   timer=setTimeout(()=>fail(new Error('Transport timeout')),timeout)
   req.on('close',()=>{if(!settled)fail(new Error('Transport closed'))});req.on('error',fail);req.end(body)
  })
 }
}
