import {z} from 'zod';
import type {AdmissionPort} from '../../admission/ports';
import type {Ref} from '../../../contracts/primitives';
import type {PolicyPort,RequestContext} from '../../authority/ports';
import type {EntityRegistry} from '../../authority/scope.server';
import type {DescriptorRegistry} from '../descriptors.server';
import type {createRecordMetadata} from '../metadata.server';
import type {createRecordReader} from '../query.server';
import type {WatchRow,WatchInput,WatchTarget,WatchEffects} from './contracts';
import {watches} from './tables.server';
import {createUlid} from '../../../core/shared/ids';
import {and,trustedPredicate,identifier} from '../../admission/sql.server';
import {AdmissionError} from '../../admission/errors';
import {idSchema} from '../validators';
import {createWatchNotices} from './notices.server';

export type WatchDependencies={db:D1Database;admission:AdmissionPort;policy:PolicyPort;descriptors:DescriptorRegistry;entities:EntityRegistry;metadata:ReturnType<typeof createRecordMetadata>;reader:ReturnType<typeof createRecordReader>;appOrigin:string};
export const watchInput=z.object({appId:idSchema,entityId:idSchema,recordId:idSchema.optional(),viewId:idSchema.optional(),enabled:z.boolean(),mode:z.enum(['immediate','daily']),channels:z.array(z.enum(['in-app','email','slack','teams','nook'])).min(1).max(5)}).strict().refine(v=>!(v.recordId&&v.viewId),'Choose one watch target');
export function createRecordWatches(d:WatchDependencies){
 const {db}=d;
 function owner(ctx:RequestContext){if(ctx.principal.kind!=='human'||!ctx.principal.humanId||!ctx.principal.sessionId||ctx.principal.credentialId)throw new AdmissionError('forbidden','Watch preferences belong to your own signed-in account.');return ctx.principal.humanId;}
 async function checked(ctx:RequestContext,target:WatchTarget){
  const operatorId=owner(ctx),scope=await d.policy.scope(ctx,{appId:target.appId,entityId:target.entityId,purpose:'read'}),guards=[...scope.currentAuthorityGuards];
  if(target.recordId){const ref={appId:target.appId,entityId:target.entityId,recordId:target.recordId},descriptor=d.descriptors.get(ref.appId,ref.entityId),raw=await d.reader.raw(ctx,scope,ref);if(!raw||['deleted','archived'].includes(String(raw[descriptor.lifecycleColumn])))throw new AdmissionError('not_found','Record is unavailable.');guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(descriptor.table.tableId)} WHERE ${identifier(descriptor.idColumn)}=? AND (${scope.rowPredicate.sql}))`,[ref.recordId,...scope.rowPredicate.values]));}
  if(target.viewId){const view=await d.metadata.readView(ctx,target.viewId);if(view.appId!==target.appId||view.entityId!==target.entityId)throw new AdmissionError('validation','Watch view belongs to another table.');guards.push(trustedPredicate("EXISTS(SELECT 1 FROM record_views WHERE id=? AND version=? AND visibility<>'deleted')",[view.id,view.version]));}
  return {operatorId,guards,kind:target.recordId?'record':target.viewId?'view':'table',targetId:target.recordId??target.viewId??target.entityId};
 }
 async function read(ctx:RequestContext,target:WatchTarget){const own=await checked(ctx,target),rows=await db.prepare('SELECT * FROM record_watches WHERE operator_id=? AND app_id=? AND entity_id=? AND target_kind=? AND target_id=? ORDER BY source').bind(own.operatorId,target.appId,target.entityId,own.kind,own.targetId).all<WatchRow>(),manual=rows.results.find(row=>row.source==='manual'),active=(manual?.enabled?manual:rows.results.find(row=>row.enabled))??manual;return {enabled:!!active?.enabled,mode:active?.mode??'immediate',channels:active?JSON.parse(active.channels_json):['in-app','email'],assigned:rows.results.some(row=>row.source.startsWith('field:')&&row.enabled),version:active?.version??0};}
 async function save(ctx:RequestContext,input:WatchInput){input=watchInput.parse(input);const own=await checked(ctx,input),old=await db.prepare("SELECT * FROM record_watches WHERE operator_id=? AND app_id=? AND entity_id=? AND target_kind=? AND target_id=? AND source='manual'").bind(own.operatorId,input.appId,input.entityId,own.kind,own.targetId).first<WatchRow>(),now=Date.parse(ctx.now),guard=and(...own.guards),nonce=createUlid(),channels=JSON.stringify([...new Set(input.channels)]);
  const commands=[db.prepare(`INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,0,CASE WHEN (${guard.sql}) THEN 1 ELSE 0 END`).bind(nonce,...guard.values),db.prepare(`INSERT INTO record_watches(id,operator_id,principal_id,app_id,entity_id,target_kind,target_id,source,enabled,mode,channels_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'manual',?,?,?,1,?,?) ON CONFLICT(operator_id,app_id,entity_id,target_kind,target_id,source) DO UPDATE SET enabled=excluded.enabled,mode=excluded.mode,channels_json=excluded.channels_json,updated_at=excluded.updated_at,version=record_watches.version+1`).bind(old?.id??createUlid(),own.operatorId,ctx.principal.id,input.appId,input.entityId,own.kind,own.targetId,input.enabled?1:0,input.mode,channels,now,now)];
  if(!input.enabled&&own.kind==='record')commands.push(db.prepare("UPDATE record_watches SET enabled=0,version=version+1,updated_at=? WHERE operator_id=? AND app_id=? AND entity_id=? AND target_kind='record' AND target_id=? AND source LIKE 'field:%'").bind(now,own.operatorId,input.appId,input.entityId,own.targetId));
  commands.push(db.prepare('DELETE FROM admission_assertions WHERE nonce=?').bind(nonce));await db.batch(commands);return read(ctx,input);
 }
 async function prepareFieldAssignments(ctx:RequestContext,input:{ref:Ref;fieldId:string;addedIds:string[];removedIds:string[];eventId:string;enabled:boolean}):Promise<WatchEffects>{
  const effects:WatchEffects={guards:[],mutations:[]},now=Date.parse(ctx.now),source='field:'+input.fieldId;
  for(const operatorId of [...new Set([...input.removedIds,...input.addedIds])]){const row=await db.prepare("SELECT * FROM record_watches WHERE operator_id=? AND app_id=? AND entity_id=? AND target_kind='record' AND target_id=? AND source=?").bind(operatorId,input.ref.appId,input.ref.entityId,input.ref.recordId,source).first<WatchRow>();if(row)effects.mutations.push({kind:'delete',table:watches,where:trustedPredicate('id=? AND version=?',[row.id,row.version]),expectedRows:1});if(!input.addedIds.includes(operatorId)||!input.enabled)continue;const p=await db.prepare("SELECT id FROM authority_principals WHERE human_id=? AND kind='human' AND state='active'").bind(operatorId).first<{id:string}>();if(!p)continue;effects.mutations.push({kind:'insert',table:watches,row:{id:createUlid(),operator_id:operatorId,principal_id:p.id,app_id:input.ref.appId,entity_id:input.ref.entityId,target_kind:'record',target_id:input.ref.recordId,source,enabled:1,mode:'immediate',channels_json:'["in-app","email"]',version:1,created_at:now,updated_at:now}});}
  return effects;
 }
 return {read,save,prepareFieldAssignments,...createWatchNotices(d)};
}
