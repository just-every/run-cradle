import { and, or, trustedPredicate, identifier } from '../admission/sql.server'
import type { SqlPredicate, SqlScalar } from '../admission/ports'
import type { AuthorityFilter } from './contracts'
import { moneySchema } from './validators'
import { normalize } from '../records/exact'
import { AuthorityError } from './errors'
export type PolicyField = { relationDiscoverable?:boolean; id:string; column:string; type:'text'|'number'|'boolean'|'date'|'instant'|'person'|'select'|'relation'|'money'|'opaque'; nullable:boolean; orderColumn?:string; currencyColumn?:string; scaleColumn?:string }
export type PolicyEntity = { id:string; table:string; idColumn:string; appColumn?:string; fields:readonly PolicyField[] }
export type EntityRegistry = { get(appId:string,entityId:string):PolicyEntity | undefined }
const invalid=():never=>{throw new AuthorityError('validation','Policy filter is not valid for the registered field.',400)}
export const compileFilter=(filter:AuthorityFilter,entity:PolicyEntity,now:string,depth=0):SqlPredicate=>{
  if(depth>32)throw new AuthorityError('validation','Policy filter is too deep.',400)
  if(filter.kind!=='condition')return (filter.kind==='all'?and:or)(...filter.conditions.map(c=>compileFilter(c,entity,now,depth+1)))
  const field=entity.fields.find(f=>f.id===filter.fieldId);if(!field)return invalid()
  if(field.type==='opaque')return invalid()
  const column=`${identifier(entity.table)}.${identifier(field.column)}`
  if(filter.op==='empty')return trustedPredicate(`${column} IS NULL`)
  if(filter.op==='not_empty')return trustedPredicate(`${column} IS NOT NULL`)
  const scalar=(value:unknown):SqlScalar=>{
    if(value===null)return null
    if(field.type==='boolean'){if(typeof value!=='boolean')return invalid();return value?1:0}
    if(field.type==='number'){if(typeof value!=='string'||! /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value))return invalid();return normalize(value)}
    if(field.type==='money')return invalid()
    if(typeof value!=='string')return invalid()
    if(field.type==='date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value).toISOString().slice(0,10)!==value))return invalid()
    if(field.type==='instant'&&!Number.isFinite(Date.parse(value)))return invalid()
    return value
  }
  if(field.type==='money'){
    if(!['eq','ne'].includes(filter.op)||!field.currencyColumn||!field.scaleColumn)return invalid()
    const money=moneySchema.safeParse(filter.value);if(!money.success)return invalid()
    const exact=`(${column} IS ? AND ${identifier(entity.table)}.${identifier(field.currencyColumn)} IS ? AND ${identifier(entity.table)}.${identifier(field.scaleColumn)} IS ?)`
    return trustedPredicate(filter.op==='ne'?`NOT ${exact}`:exact,[money.data.minor,money.data.currency,money.data.scale])
  }
  if(filter.op==='in'){if(!Array.isArray(filter.value)||filter.value.length>1000)return invalid();if(!filter.value.length)return trustedPredicate('0');const values=filter.value.map(scalar);return trustedPredicate(`${column} IN (SELECT value FROM json_each(?))`,[JSON.stringify(values)])}
  if(filter.op==='contains'){if(field.type!=='text'||typeof filter.value!=='string')return invalid();return trustedPredicate(`instr(lower(${column}),lower(?))>0`,[filter.value])}
  if(filter.op==='next_days'){if(!['date','instant'].includes(field.type)||typeof filter.value!=='string'||!/^\d{1,4}$/.test(filter.value))return invalid();const end=new Date(Date.parse(now)+Number(filter.value)*86400000).toISOString();return trustedPredicate(`${column}>=? AND ${column}<=?`,[field.type==='date'?now.slice(0,10):now,field.type==='date'?end.slice(0,10):end])}
  if(['before','after'].includes(filter.op)&&!['date','instant'].includes(field.type))return invalid()
  return trustedPredicate(`${column} ${filter.op==='eq'?'IS':filter.op==='ne'?'IS NOT':filter.op==='before'?'<':'>'} ?`,[scalar(filter.value)])
}
