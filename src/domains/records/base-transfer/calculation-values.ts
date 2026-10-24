import { lookupElementType } from '../lookup-types'
import { refSchema } from '../validators'
import type { Field } from '../contracts'
import { validateCell } from '../validators'
import { canonical } from '../../admission/canonical'
import type { PortableBase, PortableField } from './json-format'
import { ImportInputError } from './input-error'

type Table = PortableBase['base']['tables'][number]
/** Lookup values keep source identities and scalar types, including null array entries. */
export function validatePortableArray(field:PortableField,value:unknown,table:Table,tables:ReadonlyMap<string,Table>):void {
 if(!Array.isArray(value))throw new ImportInputError(`${field.label}: invalid array result`)
 const elementType=field.resultElementType
 if(!elementType){if(value.some(v=>typeof v!=='string'))throw new ImportInputError(`${field.label}: invalid string array result`);return}
 const expr=field.expression
 const relation=expr?.kind==='rollup'?table.fields.find(f=>f.id===expr.relationFieldId)?.relation:undefined
 const source=relation&&expr?.kind==='rollup'?tables.get(relation.tableId)?.fields.find(f=>f.id===expr.valueFieldId):undefined
 const sourceType=source?lookupElementType(source as Field):undefined
 if(expr?.kind==='rollup'&&expr.aggregate==='lookup'&&(!source||sourceType!==elementType))throw new ImportInputError(`${field.label}: array element type differs from its lookup source`)
 if(elementType==='relation'){
  for(const item of value){const ref=refSchema.safeParse(item);if(!ref.success||!tables.get(ref.data.entityId)?.records.some(row=>row.id===ref.data.recordId))throw new ImportInputError(`${field.label}: dangling lookup reference`)}
  return
 }
 if(elementType==='attachment')throw new ImportInputError(`${field.label}: attachment bytes have no portable base representation`)
 const scalar:Field={id:field.id,label:field.label,type:elementType,required:false,unique:false,...(elementType==='rating'?{validation:{max:'10'}}:{}),...((source?.options??field.options)?{options:source?.options??field.options}:{})}
 for(const item of value)if(canonical(validateCell(scalar,item))!==canonical(item))throw new ImportInputError(`${field.label}: array element is not canonical`)
}
