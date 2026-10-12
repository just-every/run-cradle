import { ImportInputError } from './input-error'
import type { BasePreview,PlannedRecord } from './contracts'
/** Required ONE columns belong to the row effect. Parents exist before children;
 * the kit's descending provenance order reverses children before parents. */
export function orderImportRecords(preview:Pick<BasePreview,'records'|'links'> & {schemaDraft:Pick<BasePreview['schemaDraft'],'tables'>}):PlannedRecord[]{
 const rows=new Map(preview.records.map(r=>[r.entityId+':'+r.recordId,r])),parents=new Map<string,Set<string>>(),children=new Map<string,string[]>(),required=new Set(preview.schemaDraft.tables.flatMap(t=>t.fields.filter(f=>f.type==='relation'&&f.required&&f.relation?.cardinality==='one').map(f=>t.id+':'+f.id)))
 for(const link of preview.links)if(required.has(link.entityId+':'+link.fieldId)){if(link.targetRecordIds.length!==1)throw new ImportInputError('Required ONE link must name exactly one imported record');const key=link.entityId+':'+link.recordId,parent=link.targetEntityId+':'+link.targetRecordIds[0];if(!rows.has(parent))throw new ImportInputError('Required ONE link targets a missing imported record');const set=parents.get(key)??new Set<string>();if(!set.has(parent)){const list=children.get(parent)??[];list.push(key);children.set(parent,list)}set.add(parent);parents.set(key,set)}
 const remaining=new Map([...rows.keys()].map(key=>[key,parents.get(key)?.size??0])),queue=[...rows.keys()].filter(key=>!remaining.get(key)),ordered:PlannedRecord[]=[]
 for(let index=0;index<queue.length;index++){const key=queue[index]!;ordered.push(rows.get(key)!);for(const child of children.get(key)??[]){const count=remaining.get(child)!-1;remaining.set(child,count);if(count===0)queue.push(child)}}
 if(ordered.length!==rows.size)throw new ImportInputError('Required ONE links form a record cycle; bounded native row application cannot materialize this cycle.')
 return ordered
}
