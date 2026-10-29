import type {RecordNoticeEffects} from './effects.server';
import type {DescriptorRegistry} from './descriptors.server';
import type {RecordRow} from './contracts';
import type {createRecordWatches} from './watching/service.server';
import {canonical} from '../admission/canonical';

/** All native write doors prepare these facts in the record's admission. */
export function createFieldNotices(db:D1Database,descriptors:DescriptorRegistry,watches:()=>ReturnType<typeof createRecordWatches>):RecordNoticeEffects {
 return async(ctx,{before,after,row})=>{
  const current=after??before!,descriptor=descriptors.get(current.ref.appId,current.ref.entityId),effects={guards:[] as import('../admission/ports').SqlPredicate[],mutations:[] as import('../admission/ports').SqlMutation[]};
  // Retained applications own their typed transition notification producers.
  if(descriptor.legacy)return effects;
  const append=(next:typeof effects)=>{effects.guards.push(...next.guards);effects.mutations.push(...next.mutations);};
  const ids=(record:RecordRow|null,fieldId:string)=>{const cell=record?.fields[fieldId];return cell?.state==='value'&&cell.value!==null?(Array.isArray(cell.value)?cell.value:[cell.value]).filter((v):v is string=>typeof v==='string'):[];};
  const primary=descriptor.schema.primaryFieldId??descriptor.schema.fields.find(f=>f.type==='text')?.id,cell=primary?current.fields[primary]:undefined;
  const recordLabel=cell?.state==='value'&&typeof cell.value==='string'?cell.value:descriptor.schema.label;
  const actor=await db.prepare('SELECT name FROM operators WHERE id=? AND active=1').bind(ctx.principal.humanId??ctx.principal.id).first<{name:string}>(),actorLabel=actor?.name??'An authorized operator';
  const newlyAssigned=new Set<string>();
  for(const field of descriptor.schema.fields.filter(f=>f.type==='person')){
   const old=ids(before,field.id),next=ids(after,field.id),addedIds=next.filter(id=>!old.includes(id)),removedIds=old.filter(id=>!next.includes(id)),enabled=field.notifyOnAdd!==false;
   if(addedIds.length||removedIds.length)append(await watches().prepareFieldAssignments(ctx,{ref:current.ref,fieldId:field.id,addedIds,removedIds,eventId:`field:${current.id}:${current.version}:${field.id}`,enabled}));
   if(!enabled||ctx.recordNotifications===false)continue;
   for(const operatorId of addedIds){newlyAssigned.add(operatorId);append(await watches().prepareAssignment(ctx,{ref:current.ref,fieldId:field.id,fieldLabel:field.label,recordLabel,operatorId,eventId:`field:${current.id}:${current.version}:${field.id}`,actorLabel,proposedRow:row}));}
  }
  if(after&&before&&ctx.recordNotifications!==false&&canonical(before.fields)!==canonical(after.fields))append(await watches().prepareChange(ctx,{ref:after.ref,eventId:`record:${after.id}:${after.version}`,recordLabel,kind:'change',record:after,proposedRow:row,excludeOperatorIds:[...newlyAssigned]}));
  return effects;
 };
}
