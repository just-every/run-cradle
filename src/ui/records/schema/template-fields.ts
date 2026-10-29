import { createUlid } from '../../../core/shared/ids'
import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import type { Field } from '../../../domains/records/contracts'

export function newField(label='Name',type:Field['type']='text'):Field{return {id:createUlid(),label,type,required:false,unique:false,...(type==='person'?{notifyOnAdd:true}:{})}}
export function templateFields(appId:string){
 const table=(label:string,fields:Field[]):SchemaDraft['tables'][number]=>({id:createUlid(),label,primaryFieldId:fields[0]!.id,fields})
 const select=(label:string,options:string[]):Field=>({...newField(label,'select'),options:options.map(label=>({id:createUlid(),label}))})
 const link=(label:string,target:SchemaDraft['tables'][number]):Field=>({...newField(label,'relation'),relation:{ownerAppId:appId,entityId:target.id,cardinality:'one',onDelete:'restrict'}})
 const lookup=(label:string,relation:Field,target:Field):Field=>({...newField(label,'computed'),readOnly:true,resultType:target.type,expression:{kind:'rollup',relationFieldId:relation.id,valueFieldId:target.id,aggregate:'lookup'}})
 return {table,select,link,lookup}
}
