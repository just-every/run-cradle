import type {DescriptorRegistry} from '../descriptors.server'
import {calendarAuthorContext,calendarAuthorGuards} from './approval.server'
import type {PolicyPort,RequestContext,AuthorityPermit} from '../../authority/ports'
import type {EffectRequest} from '../../execution/contracts'
import {principalGuards} from '../../authority/guards.server'
import {trustedPredicate,identifier} from '../../admission/sql.server'
import {AdmissionError} from '../../admission/errors'
import type {Definition} from './storage.server'
export function calendarAuthority(db:D1Database,policy:PolicyPort,descriptors:DescriptorRegistry){return async(ctx:RequestContext,r:EffectRequest,mode:'dispatch'|'reconcile'|'read'|'cancel'):Promise<AuthorityPermit>=>{
 const binding=r.calendarBinding;if(!binding||r.action!=='record.calendar.sync')throw new AdmissionError('forbidden','Calendar effect binding is missing.')
 const d=await db.prepare('SELECT * FROM record_calendar_definitions WHERE id=? AND app_id=?').bind(binding.definitionId,r.appId).first<Definition>()
 if(!d||d.connection_id!==r.connectionId||(ctx.principal.id!==d.owner_id&&binding.reviewResolverId!==ctx.principal.id))throw new AdmissionError('forbidden','Calendar definition belongs to another author.')
 const author=await calendarAuthorContext(db,d,ctx.requestId,ctx.ingress),scope=await policy.scope(author,{appId:d.app_id,entityId:d.entity_id,purpose:'export'}),guards=[...principalGuards(ctx),...scope.currentAuthorityGuards]
 if(ctx.principal.id!==d.owner_id){const caller=await policy.scope(ctx,{appId:d.app_id,entityId:d.entity_id,purpose:'read'}),descriptor=descriptors.get(d.app_id,d.entity_id),table=identifier(descriptor.table.tableId);guards.push(...caller.currentAuthorityGuards,trustedPredicate(`EXISTS(SELECT 1 FROM ${table} WHERE ${identifier(descriptor.idColumn)}=? AND (${caller.rowPredicate.sql}))`,[binding.recordId,...caller.rowPredicate.values]));if(mode==='read'&&r.fieldIds?.some(id=>!caller.readableFieldIds.includes(id)))throw new AdmissionError('forbidden','Calendar execution details include fields you cannot currently read.')}
 if(mode==='dispatch'){
  const descriptor=descriptors.get(d.app_id,d.entity_id),table=identifier(descriptor.table.tableId)
  guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM ${table} WHERE ${identifier(descriptor.idColumn)}=? AND (${scope.rowPredicate.sql}))`,[binding.recordId,...scope.rowPredicate.values]),...calendarAuthorGuards(author,d),trustedPredicate('EXISTS(SELECT 1 FROM record_calendar_definitions WHERE id=? AND version=? AND enabled=1)',[d.id,binding.definitionVersion]),trustedPredicate("EXISTS(SELECT 1 FROM provider_connections c,json_each(c.scopes_json) s WHERE c.id=? AND c.owner_id=? AND c.account_id=? AND c.state='connected' AND c.revoked_at IS NULL AND json_extract(s.value,'$.resource')=? AND EXISTS(SELECT 1 FROM json_each(json_extract(s.value,'$.actions')) a WHERE a.value='record.calendar.sync'))",[r.connectionId,d.owner_id,d.calendar_id,d.calendar_id]),trustedPredicate("NOT EXISTS(SELECT 1 FROM record_calendar_events WHERE definition_id=? AND record_id=? AND review_json IS NOT NULL AND (? IS NULL OR COALESCE(json_extract(review_json,'$.etag'),'deleted')<>?))",[d.id,binding.recordId,binding.reviewEtag??null,binding.reviewEtag??null]))
  if(binding.reviewEtag){const writer=await policy.scope(ctx,{appId:d.app_id,entityId:d.entity_id,purpose:'read'}),definition=JSON.parse(d.definition_json);if(!writer.writableFieldIds.includes(definition.startFieldId)||definition.endFieldId&&!writer.writableFieldIds.includes(definition.endFieldId))throw new AdmissionError('forbidden','Date write authority is required to resolve calendar review.');guards.push(...writer.currentAuthorityGuards)}
  if(r.fieldIds?.some(id=>!scope.readableFieldIds.includes(id)))throw new AdmissionError('forbidden','Calendar fields changed visibility; prepare a new event from current authority.')
 }
 for(const guard of guards)if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new AdmissionError('forbidden','Calendar sync is stopped because authority or connection approval changed.')
 return {actor:{id:ctx.principal.id,kind:ctx.principal.kind},action:mode==='dispatch'?'record.calendar.sync':mode==='cancel'?'run.cancel':`execution.${mode}`,appId:r.appId,grantId:null,grantVersion:null,policyVersion:scope.policyVersion,validUntil:ctx.principal.expiresAt<author.principal.expiresAt?ctx.principal.expiresAt:author.principal.expiresAt,guards,reservationMutations:[],reservationIds:[]}
}}
