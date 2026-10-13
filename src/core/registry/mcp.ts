import { readJsonBody } from './body'
import type { CommandTransportPorts } from './http'
import { ApiError, errorResponse } from './errors.server'
import { createUlid } from '../shared/ids'

/** Stateless JSON-RPC MCP over authenticated HTTP; no ambient cookie authority. */
export function createMcpTransport(ports: CommandTransportPorts) {
  return async (request: Request): Promise<Response> => {
    const requestId=createUlid()
    if(request.method!=='POST')return new Response(null,{status:405,headers:{allow:'POST'}})
    try {
      if(!request.headers.get('authorization')?.startsWith('Bearer '))throw new ApiError('signed_out','A scoped machine credential is required.')
      const ctx=await ports.authenticate(request,'mcp',requestId)
      if(request.headers.has('origin')&&request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError('forbidden','Untrusted MCP request origin.')
      const body = await readJsonBody(request)
      if(!body||typeof body!=='object'||Array.isArray(body))throw new ApiError('validation','A single JSON-RPC request is required.')
      const message=body as {jsonrpc?:unknown;method?:unknown;id?:unknown;params?:unknown}
      if(message.jsonrpc!=='2.0'||typeof message.method!=='string'||(message.id!==undefined&&typeof message.id!=='string'&&typeof message.id!=='number'))throw new ApiError('validation','Invalid JSON-RPC envelope.')
      if(message.method==='notifications/initialized'&&message.id===undefined)return new Response(null,{status:202})
      let result: unknown
      if(message.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'cradle',version:'0.0.0'}}
      else if(message.method==='ping')result={}
      else if(message.method==='tools/list')result={tools:(await ports.commands.discover(ctx)).map(item=>({name:item.action,description:item.description,inputSchema:item.inputSchema}))}
      else if(message.method==='tools/call') {
        const params=message.params as {name?:unknown;arguments?:unknown}|undefined
        if(!params||typeof params.name!=='string')throw new ApiError('validation','A tool name and typed arguments are required.')
        const query=ports.commands.query(params.name),command=ports.commands.get(params.name)
        if(query&&query.visible(ctx))result={content:[{type:'text',text:JSON.stringify({result:await query.run(ctx,params.arguments??{})})}],isError:false}
        else {
          if(!command||!await command.visible(ctx))throw new ApiError('not_found','Tool is not available.')
          const receipt=await command.execute(ctx,params.arguments)
          result={content:[{type:'text',text:JSON.stringify({result:receipt.result,consistencyToken:receipt.consistencyToken})}],isError:false}
        }
      } else return Response.json({jsonrpc:'2.0',id:message.id??null,error:{code:-32601,message:'Method not found'}},{headers:{'x-request-id':requestId}})
      return Response.json({jsonrpc:'2.0',id:message.id??null,result},{headers:{'x-request-id':requestId,'cache-control':'no-store'}})
    } catch(error){return errorResponse(error,requestId,'mcp')}
  }
}
