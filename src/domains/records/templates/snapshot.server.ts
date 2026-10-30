import type { CellValue, Ref } from '../../../contracts/primitives'
import type { RequestContext } from '../../authority/ports'
import type { SqlPredicate } from '../../admission/ports'
import type { RecordActionDependencies } from '../actions.server'
import { AdmissionError } from '../../admission/errors'
import { and, eq, exists } from '../../admission/sql.server'
import { schemaGuard } from '../change.server'

export type TemplateDependencies = Pick<RecordActionDependencies,'policy'|'descriptors'|'reader'|'writer'>
export type SnapshotOptions = {includeLinks:boolean;includeAttachments:boolean}
export function templateSnapshots(deps:TemplateDependencies) {
  async function source(ctx:RequestContext,ref:Ref,version?:number) {
    const descriptor=deps.descriptors.get(ref.appId,ref.entityId),scope=await deps.policy.scope(ctx,{...ref,purpose:'read'}),record=await deps.reader.record(ctx,scope,ref)
    if(['deleted','archived'].includes(record.lifecycle))throw new AdmissionError('not_found','Template source is unavailable.')
    if(version!==undefined&&record.version!==version)throw new AdmissionError('version_conflict','Source record changed.',record.version)
    const guards=[schemaGuard(descriptor),...scope.currentAuthorityGuards,exists(descriptor.table,and(scope.rowPredicate,eq(descriptor.table,descriptor.idColumn,ref.recordId),eq(descriptor.table,descriptor.versionColumn,record.version)))]
    return {descriptor,scope,record,guards}
  }
  async function snapshot(ctx:RequestContext,ref:Ref,options:SnapshotOptions,version?:number) {
    const current=await source(ctx,ref,version),values:Record<string,CellValue>={}
    for(const field of current.descriptor.schema.fields){
      const cell=current.record.fields[field.id]
      if(field.readOnly||field.type==='computed'||current.descriptor.writePolicy?.protectedFieldIds?.includes(field.id)||!current.scope.writableFieldIds.includes(field.id)||cell?.state!=='value')continue
      if(field.type==='relation'&&!options.includeLinks||field.type==='attachment'&&!options.includeAttachments)continue
      values[field.id]=structuredClone(cell.value)
    }
    return {...current,values}
  }
  async function project(ctx:RequestContext,ref:Ref,values:Record<string,CellValue>):Promise<{values:Record<string,CellValue>;guards:SqlPredicate[]}> {
    const current=await source(ctx,ref),result:Record<string,CellValue>={}
    for(const [id,value]of Object.entries(values)){
      const cell=await deps.reader.projectCell(ctx,current.scope,ref,id,{state:'value',value})
      if(cell.state==='value')result[id]=cell.value
    }
    return {values:result,guards:current.guards}
  }
  return {source,snapshot,project}
}
