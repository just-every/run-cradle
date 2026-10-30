import type { EntitySchema } from '../contracts'
import type { DescriptorRegistry, EntityDescriptor } from '../descriptors.server'
import { createDescriptorRegistry } from '../descriptors.server'
import { createRecordReader } from '../query.server'
import type { PolicyPort, RequestContext } from '../../authority/ports'
import type { CalculationPreview } from './contracts'
import { canonical } from '../../admission/canonical'

/** Candidate definitions read the reviewed live storage; no staging tables or data writes. */
export async function previewCalculations(db: D1Database, policy: PolicyPort, registry: DescriptorRegistry, schemas: EntitySchema[], compiled: readonly EntityDescriptor[], rows: Record<string,Record<string,unknown>[]> , ctx: RequestContext, storageChanges = false): Promise<CalculationPreview[]> {
  const tables = schemas.flatMap(schema => {
    const prior = registry.list(schema.appId).find(d => d.schema.id === schema.id)
    const fields = schema.fields.filter(f => f.type === 'computed')
    return prior && fields.length ? [{ schema, prior, fields }] : []
  })
  if (!tables.length) return []
  const overlays: EntityDescriptor[] = registry.list().filter(prior => prior.schema.appId !== schemas[0]?.appId || schemas.some(schema => schema.id === prior.schema.id)).map(prior => {
    const schema = schemas.find(s => s.appId === prior.schema.appId && s.id === prior.schema.id)
    if (!schema) return prior
    return { ...prior, schema, fields: new Map(schema.fields.map(field => [field.id, { ...(prior.fields.get(field.id) ?? { column: '' }), field }])) }
  })
  const candidates = createDescriptorRegistry([...overlays,...compiled.filter(d=>!registry.list(d.schema.appId).some(old=>old.schema.id===d.schema.id))])
  const previewPolicy: PolicyPort = { ...policy, async scope(reader, request) {
    const scope = await policy.scope(reader, request), prior = registry.get(request.appId, request.entityId), schema = candidates.get(request.appId, request.entityId).schema
    // buildPreview has already required complete current access to these tables.
    // Only prospective fields are added; existing policy and row fences survive.
    const added = schema.fields.filter(f => !prior.fields.has(f.id)).map(f => f.id)
    return { ...scope, readableFieldIds: [...scope.readableFieldIds, ...added], discoverableRelations: [...scope.discoverableRelations, ...schema.fields.filter(f => !prior.fields.has(f.id) && f.type === 'relation').map(f => f.id)] }
  } }
  const beforeReader = createRecordReader(db, registry, policy, crypto.randomUUID()), afterReader = createRecordReader(db, candidates, previewPolicy, crypto.randomUUID())
  const results: CalculationPreview[] = []
  for (const { schema, prior, fields } of tables) {
    const stored = rows[prior.table.tableId] ?? [], scope = await policy.scope(ctx, { appId: schema.appId, entityId: schema.id, purpose: 'read' }), nextScope = await previewPolicy.scope(ctx, { appId: schema.appId, entityId: schema.id, purpose: 'read' })
    // Re-evaluate unchanged definitions too: a changed source can affect a
    // same-table formula, linked lookup, rollup, filter or sort transitively.
    // The release caller fences every table, join, schema and current read grant.
    // Storage conversions need a staged-value reader before claiming completeness.
    const complete = !storageChanges
    const reports = fields.map(field => ({
      field, edited: canonical(field) !== canonical(prior.fields.get(field.id)?.field ?? null),
      samples: [] as CalculationPreview['samples'], changes: [] as CalculationPreview['samples'],
    }))
    const primary=prior.schema.fields.find(f=>f.id===prior.schema.primaryFieldId)??prior.schema.fields.find(f=>f.type==='text')
    const beforeFields=[...new Set([...(primary?[primary.id]:[]),...fields.filter(field=>prior.fields.has(field.id)).map(field=>field.id)])]
    for (const row of complete ? stored : stored.slice(0, 10)) {
      // Share the ordinary reader's per-record calculation cache across fields.
      const beforeRow=await beforeReader.render(ctx,scope,prior,row,beforeFields)
      const afterRow=await afterReader.render(ctx,nextScope,candidates.get(schema.appId,schema.id),row,fields.map(field=>field.id))
      const labelCell=primary&&beforeRow.fields[primary.id]
      let recordLabel='Record without a title'
      if(labelCell?.state==='value'&&labelCell.value!==null){const type=primary!.type==='computed'?primary!.resultType:primary!.type;if(type==='select')recordLabel=primary!.options?.find(option=>option.id===labelCell.value)?.label??recordLabel;else if(typeof labelCell.value==='boolean')recordLabel=labelCell.value?'Yes':'No';else if(typeof labelCell.value==='string'&&labelCell.value.trim())recordLabel=labelCell.value}
      for(const report of reports){
        const before=prior.fields.has(report.field.id)?beforeRow.fields[report.field.id]!:null,after=afterRow.fields[report.field.id]!
        const cell={recordId:String(row[prior.idColumn]),recordLabel,before,after}
        if(report.samples.length<10)report.samples.push(cell)
        if(complete&&canonical(before)!==canonical(after))report.changes.push(cell)
      }
    }
    for(const {field,edited,samples,changes} of reports)if(edited||changes.length||!complete)results.push({entityId:schema.id,fieldId:field.id,label:field.label,resultType:field.resultType!,totalRecords:stored.length,samples,...(complete?{changes}:{incompleteReason:'This change also converts or restores stored values. Calculations show a sample of current storage; a complete post-conversion report is not available.'})})
  }
  return results
}
