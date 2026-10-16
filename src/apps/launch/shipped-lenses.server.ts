import { previewLens } from './lenses.server'
import { lensDefinition } from './contracts'
export async function readShippedLens(db:D1Database,key:'risks'|'timeline',cursor?:string){
 const row=await db.prepare('SELECT * FROM lenses WHERE shipped_key=?').bind(key).first<Record<string,unknown>>()
 if(!row)throw new Error(`The shipped ${key} lens is unavailable`)
 const definition=lensDefinition.parse({name:row.name,description:row.description,recordType:row.record_type,conditions:JSON.parse(String(row.conditions_json)),sort:JSON.parse(String(row.sort_json)),fields:JSON.parse(String(row.fields_json)),display:row.display})
 const page=await previewLens(db,definition,new Date().toISOString(),cursor?Number(cursor):0)
 return{...page,id:String(row.id),name:definition.name,description:definition.description,definition}
}
