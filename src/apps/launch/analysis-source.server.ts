import type {RevisionRef} from '../../contracts/primitives'
import type {RequestContext} from '../../domains/authority/ports'
import {trustedPredicate} from '../../domains/admission/sql.server'
import type {SqlPredicate} from '../../domains/admission/ports'
import type {LaunchContext} from './domain.server'
import {fail} from './domain.server'
import {LAUNCH_APP_ID,launchEntities} from './contracts'
import {launchFieldIds,type LaunchKind} from './descriptors.server'
/** Revalidate every prepared source with one current scope per entity, before egress and result admission. */
export async function analysisSourceGuards(context:LaunchContext,ctx:RequestContext,versions:RevisionRef[]):Promise<SqlPredicate[]>{
 const guards:SqlPredicate[]=[],groups=new Map<string,RevisionRef[]>()
 for(const revision of versions){if(revision.ref.appId!==LAUNCH_APP_ID)fail('Analysis source is outside launch authority');const group=groups.get(revision.ref.entityId)??[];group.push(revision);groups.set(revision.ref.entityId,group)}
 for(const [entityId,revisions]of groups){
  const kind=Object.keys(launchEntities).find(k=>launchEntities[k as keyof typeof launchEntities]===entityId) as LaunchKind
  const scope=await context.policy.scope(ctx,{appId:LAUNCH_APP_ID,entityId,purpose:'provider_context'})
  if(Object.values(launchFieldIds[kind]).some(field=>!scope.readableFieldIds.includes(field)))fail('Analysis source fields are no longer authorized')
  const table=({campaign:'campaigns',deliverable:'deliverables',milestone:'milestones',risk:'risks',decision:'decisions',lens:'lenses'} as Record<string,string>)[kind]
  const active=kind==='campaign'?'archived_at IS NULL':kind==='lens'?'1':`EXISTS(SELECT 1 FROM campaigns c WHERE c.id=${table}.campaign_id AND c.archived_at IS NULL)`
  guards.push(...scope.currentAuthorityGuards,trustedPredicate(`NOT EXISTS(SELECT 1 FROM json_each(?) source WHERE NOT EXISTS(SELECT 1 FROM ${table} WHERE id=json_extract(source.value,'$.id') AND version=json_extract(source.value,'$.version') AND (${active}) AND (${scope.rowPredicate.sql})))`,[JSON.stringify(revisions.map(revision=>({id:revision.ref.recordId,version:revision.version}))),...scope.rowPredicate.values]))
 }
 return guards
}
