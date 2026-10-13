import {ulid} from './proposal.mjs'
/** The proposal door as an outside agent sees it: MCP JSON-RPC, or the REST face. */
export function door(origin,key,face='mcp'){
 const headers={authorization:`Bearer ${key}`,'content-type':'application/json'}
 async function send(path,init){const response=await fetch(origin+path,{...init,headers});const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(`${init?.method??'GET'} ${path} answered ${response.status}: ${body?.error?.message??'no message'}`);return body}
 let id=0
 const call=async(name,args)=>{const body=await send('/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:args}})});return JSON.parse(body.result.content[0].text).result}
 if(face==='mcp')return {
  async tools(){await send('/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'initialize',params:{}})});return (await send('/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/list',params:{}})})).result.tools.map(t=>t.name)},
  schema:()=>call('schema.read',{}),
  propose:async input=>(await call('schema.propose',{commandId:ulid(),expected:[],input})).value,
  proposal:proposalId=>call('schema.proposal',{proposalId}),
 }
 return {
  async tools(){return ['schema.read','schema.propose','schema.proposal']},
  schema:async()=>(await send('/api/v1/proposals/schema')).data,
  propose:async input=>(await send('/api/v1/commands/schema.propose',{method:'POST',body:JSON.stringify({commandId:ulid(),expected:[],input})})).data.value,
  proposal:async proposalId=>(await send(`/api/v1/proposals/${proposalId}`)).data,
 }
}
