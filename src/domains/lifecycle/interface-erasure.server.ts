import type {Effects} from './changes.server'
import {updateRows} from './changes.server'
import {trustedPredicate} from '../admission/sql.server'
import {canonical} from '../admission/canonical'
import {scrubWholeTokens} from './identity-match'

/** Membership identifiers leave all retained layouts; erased authors become anonymous. */
export async function eraseInterfaceIdentity(db:D1Database,change:Effects,id:string,needles:string[],label:string,others:string[]){
 for(const table of ['record_interfaces','record_interface_versions']){
  const rows=(await db.prepare(`SELECT * FROM ${table} WHERE author_id=? OR EXISTS(SELECT 1 FROM json_tree(definition_json,'$.audience.people') WHERE atom=?) OR json_extract(definition_json,'$.authorId')=?`).bind(id,id,id).all<{id?:string;interface_id?:string;version:number;author_id:string|null;definition_json:string}>()).results
  const expression=`(SELECT COALESCE(json_group_array(json_array(${table==='record_interfaces'?'id':'interface_id'},version,definition_json,author_id)),'[]') FROM (SELECT * FROM ${table} WHERE author_id=? OR EXISTS(SELECT 1 FROM json_tree(definition_json,'$.audience.people') WHERE atom=?) OR json_extract(definition_json,'$.authorId')=? ORDER BY ${table==='record_interfaces'?'id':'interface_id,version'}))`
  const captured=await db.prepare(`SELECT ${expression} AS snapshot`).bind(id,id,id).first<{snapshot:string}>();change.guards.push(trustedPredicate(`${expression}=?`,[id,id,id,captured!.snapshot]))
  for(const row of rows){
   const definition=JSON.parse(row.definition_json),next=structuredClone(definition)
   if(next.authorId===id)next.authorId=null
   next.audience.people=next.audience.people.filter((person:string)=>person!==id)
   if(row.author_id===id){
    const scrub=(value:string)=>scrubWholeTokens(value,needles,label,others).text
    next.name=scrub(next.name)
    for(const page of next.pages){page.title=scrub(page.title);for(const section of page.sections){section.title=scrub(section.title);section.tab=scrub(section.tab);for(const component of section.components)if(component.kind==='text')component.text=scrub(component.text)}}
   }
   const where=table==='record_interfaces'?'id=? AND version=?':'interface_id=? AND version=?'
   await updateRows(db,change,table,{definition_json:canonical(next),author_id:row.author_id===id?null:row.author_id},where,[row.id??row.interface_id!,row.version])
  }
 }
}
