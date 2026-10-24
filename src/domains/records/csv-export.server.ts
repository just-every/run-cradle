import { phoneText } from './phone'
import { AdmissionError } from '../admission/errors'
import type { CellValue } from '../../contracts/primitives'
import type { Field } from './contracts'
/** A downloaded CSV identifies its view, workspace currency and capture instant in its filename. */
export async function exportContext(db:D1Database,name:string,capturedAt:string,fields:Field[]) {
 const workspace=await db.prepare('SELECT currency,timezone FROM workspace LIMIT 1').first<{currency:string;timezone:string}>()
 if(fields.some(f=>['money','instant'].includes(f.resultType??f.type))&&!workspace)throw new AdmissionError('unconfigured','Workspace currency and timezone are required for this export.')
 const filename=[name,fields.some(f=>(f.resultType??f.type)==='money')?workspace?.currency:null,workspace?new Intl.DateTimeFormat('sv-SE',{timeZone:workspace.timezone,dateStyle:'short',timeStyle:'medium'}).format(new Date(capturedAt))+' '+workspace.timezone:capturedAt].filter(Boolean).join(' — ').replace(/[\/:*?"<>|]/g,'-')+'.csv'
 return {name,capturedAt,currency:workspace?.currency??null,timezone:workspace?.timezone??null,filename}
}
export function formatWorkspaceCell(field:Field,value:CellValue,context:Awaited<ReturnType<typeof exportContext>>,encode:()=>string):string {
 if(value===null)return encode()
 const type=field.resultType??field.type
 if(type==='phone'&&typeof value==='string')return phoneText(value)
 if(type==='money'&&typeof value==='object'&&!Array.isArray(value)&&'minor' in value){
  if(value.currency!==context.currency)throw new AdmissionError('validation','Money currency differs from the workspace currency; no exchange conversion is configured.')
  return encode()
 }
 if(type==='instant'&&typeof value==='string')return new Intl.DateTimeFormat('en-CA',{timeZone:context.timezone!,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}).format(new Date(value))
 return encode()
}
