import type { PortableField } from './json-format'
/** CSV stores displayed calculation results; native JSON carries their executable definitions. */
export function csvResultType(field:PortableField):PortableField['type'] {
 if(!field.expression)return field.type
 const type=field.resultType
 if(type==='array')return 'text'
 if(!type)throw new Error('Calculated CSV field needs a result type')
 return type
}
