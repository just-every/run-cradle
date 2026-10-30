import { lookupCollection, lookupElementType } from './lookup-types'
import type { EntitySchema, Expr, Field, Filter } from './contracts'
import { validateFunction, functionDefinition } from './formula-functions'
import { validateCell } from './validators'
import { normalize } from './exact'
import { canonical } from '../admission/canonical'
export type CalculationTable = Pick<EntitySchema,'id'|'fields'>
type ResultType = Field['type'] | 'array' | 'blank'
const scalar = ['email','rating','duration','phone','text', 'url', 'number', 'date', 'instant', 'money', 'boolean', 'select', 'person']
export function expressionType(expr: Expr, table: CalculationTable, tables: readonly CalculationTable[], depth = 0, cache=new Map<string,ResultType>(), path=new Set<string>()): ResultType {
  if (depth > 64) throw new Error('Expression depth exceeds 64')
  if (expr.kind === 'literal') {
    if (expr.valueType === 'number') { if (typeof expr.value !== 'string' || normalize(expr.value) !== expr.value) throw new Error('Numeric literal must be a canonical decimal'); return 'number' }
    if (expr.value === null) return 'blank'
    if (typeof expr.value === 'boolean') return 'boolean'
    if (typeof expr.value === 'string') return 'text'
    throw new Error('Formula literals must be scalar values')
  }
  if (expr.kind === 'field') {
    const field = table.fields.find(f => f.id === expr.fieldId)
    if (!field) throw new Error('Unknown formula dependency')
    const type = computedType(field,table,tables,depth,cache,path)
    if (!type || !scalar.includes(type)) throw new Error('Formula needs a scalar field')
    return type==='select'?'text':type
  }
  if (expr.kind === 'rollup') {
    const relation = table.fields.find(f => f.id === expr.relationFieldId)?.relation
    const target = tables.find(t => t.id === relation?.entityId), source = target?.fields.find(f => f.id === expr.valueFieldId)
    if (!relation || !source) throw new Error('Rollup needs a link and a source field')
    validateCondition(expr.filter, target!)
    if(expr.aggregate!=='lookup'&&(expr.sort!==undefined||expr.limit!==undefined))throw new Error('Sort and limit apply to lookups')
    if(new Set((expr.sort??[]).map(sort=>sort.fieldId)).size!==(expr.sort??[]).length)throw new Error('Lookup sort fields must be distinct')
    for(const sort of expr.sort??[]){const field=target!.fields.find(field=>field.id===sort.fieldId);if(!field||!scalar.includes(computedType(field,target!,tables,depth,cache,path)))throw new Error('Lookup sort requires a scalar field')}
    if (['count','counta','countall'].includes(expr.aggregate)) return 'number'
    if (expr.aggregate === 'and' || expr.aggregate === 'or') return 'boolean'
    if (expr.aggregate === 'arrayjoin') return 'text'
    if (expr.aggregate === 'arrayunique') { if(!['email','rating','duration','phone','text','number','date','url','select','person','instant'].includes(source.type==='computed'?source.resultType??'':source.type))throw new Error('ARRAYUNIQUE needs a scalar string source');return 'array' }
    const type = computedType(source,target!,tables,depth,cache,path)
    if (expr.aggregate === 'lookup') { if (!lookupElementType(source)) throw new Error('Lookup source type is unavailable'); return relation.cardinality==='many'||lookupCollection(source)?'array':type }
    if (!type || !['number','money'].includes(type)) throw new Error('SUM, AVERAGE, MIN and MAX require a numeric source field')
    return type
  }
  validateFunction(expr.fn, expr.args.length)
  const types = expr.args.map(arg => expressionType(arg, table, tables, depth + 1,cache,path))
  const definition = functionDefinition(expr.fn)
  if (expr.fn === 'abs' && types[0] !== 'number') throw new Error('ABS expects a numeric operand')
  if(['add','subtract'].includes(expr.fn)&&types.every(type=>type==='money'))return 'money'
  if (definition.result === 'argument' || definition.result === 'branch') {
    const choices = definition.result === 'branch' ? types.slice(1) : types
    const nonblank = choices.filter(type => type !== 'blank')
    if (new Set(nonblank).size > 1) throw new Error('Formula branches must return the same type')
    return nonblank[0] ?? 'blank'
  }
  return definition.result
}
function computedType(field:Field,table:CalculationTable,tables:readonly CalculationTable[],depth:number,cache:Map<string,ResultType>,path:Set<string>):ResultType {
  if(field.type!=='computed')return field.type
  const key=table.id+':'+field.id
  if(path.has(key))throw new Error('Formula dependency cycle')
  if(cache.has(key))return cache.get(key)!
  if(!field.expression)throw new Error('Computed field needs an expression')
  const type=expressionType(field.expression,table,tables,depth+1,cache,new Set(path).add(key));cache.set(key,type);return type
}
function validateCondition(filter: Filter | undefined, table: CalculationTable, depth = 0): void {
  if (!filter) return
  if (depth > 64) throw new Error('Filter depth exceeds 64')
  if (filter.kind !== 'condition') { filter.conditions.forEach(f => validateCondition(f, table, depth + 1)); return }
  const source = table.fields.find(f => f.id === filter.fieldId)
  if (!source || !scalar.includes(source.type)) throw new Error('Rollup conditions require a stored scalar field')
  if(['empty','not_empty'].includes(filter.op))return
  if(filter.op==='contains'&&!['email','phone','text','url'].includes(source.type))throw new Error('contains needs text')
  if(filter.op==='next_days'){if(source.type!=='date'||typeof filter.value!=='string'||!/^\d{1,4}$/.test(filter.value))throw new Error('next_days needs a date and bounded integral days');return}
  if(filter.op==='in'){if(!Array.isArray(filter.value)||filter.value.length>200)throw new Error('in needs at most 200 values');for(const value of filter.value)validateCell({...source,required:false},value);return}
  validateCell({...source,required:false},filter.value)
}
export function calculationKind(field:Field):'formula'|'lookup'|'rollup'|'count'{return field.expression?.kind!=='rollup'?'formula':field.expression.aggregate==='lookup'?'lookup':field.expression.aggregate==='countall'?'count':'rollup'}
export function validateCalculationTypes(schemas: readonly CalculationTable[]): void {
  for (const table of schemas) for (const field of table.fields) if (field.type === 'computed') {
    try {
      if (!field.expression || !field.resultType) throw new Error('Computed field needs an expression and result type')
      const type = expressionType(field.expression, table, schemas)
      if (type !== 'blank' && type !== field.resultType) throw new Error(`Expression returns ${type}, rather than ${field.resultType}`)
      if(field.expression.kind==='rollup'&&field.expression.aggregate==='lookup'){
        const expression=field.expression,relation=table.fields.find(f=>f.id===expression.relationFieldId)!.relation!,target=schemas.find(t=>t.id===relation.entityId)!,source=target.fields.find(f=>f.id===expression.valueFieldId)!
        const elementType=lookupElementType(source)
        if(relation.cardinality==='many'||lookupCollection(source)?field.resultElementType!==elementType:field.resultElementType!==undefined)throw new Error('Lookup array element type must match its source')
        if(elementType==='select'&&canonical(field.options??[])!==canonical(source.options??[]))throw new Error('Lookup select options must match its source field')
      }else if(field.resultElementType!==undefined)throw new Error('Element type is reserved for array lookups')
    } catch (error) { throw new Error(`${field.label}: ${(error as Error).message}`) }
  }
}
