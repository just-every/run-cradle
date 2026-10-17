import type { EntitySchema, Expr } from './contracts'
import type { PolicyPort, PolicyScope, RequestContext } from '../authority/ports'
import type { DescriptorRegistry } from './descriptors.server'
import { filterFields } from './filter.server'
/** Formula definitions can themselves disclose hidden dependency IDs, options or constants. */
export async function visibleCalculationSchema(ctx: RequestContext, schema: EntitySchema, scope: PolicyScope, registry: DescriptorRegistry, policy: PolicyPort): Promise<EntitySchema> {
  async function visible(expr: Expr, current: EntitySchema, own: PolicyScope, depth = 0): Promise<boolean> {
    if (depth > 64) return false
    if (expr.kind === 'literal') return true
    if (expr.kind === 'call') return (await Promise.all(expr.args.map(arg => visible(arg,current,own,depth+1)))).every(Boolean)
    const id = expr.kind === 'field' ? expr.fieldId : expr.relationFieldId
    if (!own.readableFieldIds.includes(id)) return false
    const dependency = current.fields.find(f=>f.id===id)
    if (expr.kind === 'field') return !dependency?.expression || visible(dependency.expression,current,own,depth+1)
    if (!dependency?.relation || !own.discoverableRelations.includes(id)) return false
    try {
      const target = registry.get(dependency.relation.ownerAppId,dependency.relation.entityId).schema
      const targetScope = await policy.scope(ctx,{appId:target.appId,entityId:target.id,purpose:'read'})
      const dependencies=[expr.valueFieldId,...filterFields(expr.filter),...(expr.sort??[]).map(sort=>sort.fieldId)]
      if(dependencies.some(id=>!targetScope.readableFieldIds.includes(id)))return false
      for(const id of dependencies){const value=target.fields.find(field=>field.id===id);if(value?.expression&&!await visible(value.expression,target,targetScope,depth+1))return false}
      return true
    } catch(error) { if(error instanceof Error && 'code' in error && ['forbidden','not_found','grant_expired','grant_revoked'].includes(String(error.code))) return false; throw error }
  }
  const fields = await Promise.all(schema.fields.map(async field => {
    if(field.expression&&!await visible(field.expression,schema,scope)){const {expression,options,...safe}=field;return safe}
    if(field.linkPicker&&field.relation){
      try{
        const target=await policy.scope(ctx,{appId:field.relation.ownerAppId,entityId:field.relation.entityId,purpose:'read'})
        return {...field,linkPicker:{...field.linkPicker,searchFieldIds:field.linkPicker.searchFieldIds.filter(id=>target.readableFieldIds.includes(id)),displayFieldIds:field.linkPicker.displayFieldIds.filter(id=>target.readableFieldIds.includes(id))}}
      }catch(error){if(error instanceof Error&&'code'in error&&['forbidden','not_found','grant_expired','grant_revoked'].includes(String(error.code))){const {linkPicker,...safe}=field;return safe}throw error}
    }
    return field
  }))
  return {...schema,fields}
}
