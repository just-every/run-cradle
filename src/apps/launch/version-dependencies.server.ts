import type { RevisionRef } from '../../contracts/primitives'
import type { VersionDependency } from '../../domains/admission/ports'
import type { RequestContext } from '../../domains/authority/ports'
import { and,identifier } from '../../domains/admission/sql.server'
import { LAUNCH_APP_ID,launchEntities } from './contracts'
import { launchTables,type LaunchKind } from './descriptors.server'
import type { LaunchContext } from './domain.server'

export async function currentLaunchVersion(context:LaunchContext,ctx:RequestContext,kind:LaunchKind,id:string) {
 const scope=await context.policy.scope(ctx,{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],purpose:'read'})
 const guard=and(scope.rowPredicate,...scope.currentAuthorityGuards)
 const row=await context.db.prepare(`SELECT version FROM ${identifier(launchTables[kind])} WHERE id=? AND (${guard.sql})`)
  .bind(id,...guard.values).first<{version:number}>()
 return row?.version??null
}

export function launchVersionDependencies(context:LaunchContext,ctx:RequestContext,revisions:readonly RevisionRef[]):VersionDependency[] {
 return revisions.filter(revision=>revision.ref.appId===LAUNCH_APP_ID).flatMap(revision=>{
  const kind=(Object.keys(launchEntities) as LaunchKind[]).find(kind=>launchEntities[kind]===revision.ref.entityId)
  return kind?[{label:kind,version:revision.version,current:()=>currentLaunchVersion(context,ctx,kind,revision.ref.recordId)}]:[]
 })
}
