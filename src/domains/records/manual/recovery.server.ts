import type { EntitySchema } from '../contracts'
import { decode } from '../codec.server'
import { physicalName } from '../descriptors.server'
import { encodeCsv } from '../../portability/csv'
import { encodeCsvValue } from '../csv.server'
/** Retained manual tables use compiler-owned scalar columns and stable field IDs. */
export function recoveryTables(prior:EntitySchema[],snapshots:Record<string,Record<string,unknown>[]>){
 return prior.map(schema=>{
  const fields=schema.fields.filter(f=>f.type!=='computed'),rows=snapshots[physicalName(schema)];if(!rows)throw new Error('Retained schema recovery snapshot is missing.')
  return {entityId:schema.id,name:schema.label,recordCount:rows.length,csv:encodeCsv(['_record_id',...fields.map(f=>f.label)],rows.map(row=>[String(row.id),...fields.map(field=>{const column='f_'+field.id.toLowerCase();const value=field.relation?.cardinality==='many'?(snapshots[physicalName(schema)+'_'+column]??[]).filter(link=>link.record_id===row.id).sort((a,b)=>Number(a.position)-Number(b.position)).map(link=>({appId:field.relation!.ownerAppId,entityId:field.relation!.entityId,recordId:String(link.value)})):decode({field,column},row);return encodeCsvValue(field,value)})]))}
 })
}
