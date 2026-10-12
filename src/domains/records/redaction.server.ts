import type { Ref } from '../../contracts/primitives';
import type { SqlMutation } from '../admission/ports';
import { and,eq,registerTable } from '../admission/sql.server';
/** Erasure invalidates retained previews, undo and saved definitions that carry subject identifiers. */
export function createRecordRedactionPort(db:D1Database){
 const definitions=[{table:registerTable('record_previews',['id','input_json','expected_json']),fields:['input_json','expected_json']},{table:registerTable('record_undo',['id','inverse_json']),fields:['inverse_json']},{table:registerTable('record_views',['id','definition_json']),fields:['definition_json']},{table:registerTable('record_forms',['id','definition_json']),fields:['definition_json']}];
 async function affected(input:{subjectRefs:Ref[];personalContentRefs:string[]}){
  const ids=new Set([...input.subjectRefs.map(ref=>ref.recordId),...input.personalContentRefs]);
  const contains=(value:unknown):boolean=>typeof value==='string'?ids.has(value):!!value&&typeof value==='object'&&Object.values(value).some(contains);
  const matches: {definition:typeof definitions[number];row:Record<string,string>}[]=[];
  for(const definition of definitions){const rows=await db.prepare(`SELECT id,${definition.fields.join(',')} FROM ${definition.table.tableId}`).all<Record<string,string>>();for(const row of rows.results)if(definition.fields.some(field=>contains(JSON.parse(row[field]!))))matches.push({definition,row});}
  return matches;
 }
 return {
  async prepare(input:{subjectRefs:Ref[];personalContentRefs:string[]}):Promise<{guards:[];mutations:SqlMutation[]}>{return {guards:[],mutations:(await affected(input)).map(({definition,row})=>({kind:'delete',table:definition.table,where:and(eq(definition.table,'id',row.id!),...definition.fields.map(field=>eq(definition.table,field,row[field]!))),expectedRows:1}))};},
  async verify(input:{subjectRefs:Ref[];personalContentRefs:string[]}):Promise<boolean>{return (await affected(input)).length===0;}
 };
}
