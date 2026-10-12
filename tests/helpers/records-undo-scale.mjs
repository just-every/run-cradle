import {harness} from './records-manual-harness.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {encodeValues} from '../../src/domains/records/codec.server.ts'
import {compileSchema,createDescriptorRegistry} from '../../src/domains/records/descriptors.server.ts'
import {createNativeImportTarget} from '../../src/domains/records/base-transfer/target.server.ts'
import {checkSql} from '../../vendor/base/modules/import-kit/src/d1/budget.ts'

export async function nativeUndoScale(rowsPerTable=8500,tableCount=4){
 const h=await harness(),appId=createUlid(),tables=Array.from({length:tableCount},(_,index)=>{const field={id:createUlid(),label:'Name',type:'text',required:false,unique:false};return {id:createUlid(),label:'Scale '+index,primaryFieldId:field.id,fields:[field]}})
 const {r}=await h.create({appId,name:'Native undo scale',tables}),target=createNativeImportTarget(r.registry),effects=[]
 const statements=new Map(),execute=statement=>{checkSql(statement);let prepared=statements.get(statement.sql);if(!prepared){prepared=h.sql.prepare(statement.sql);statements.set(statement.sql,prepared)}prepared.run(...(statement.params??[]))}
 h.sql.exec('BEGIN')
 try{
  for(const [group,table]of tables.entries()){
   const descriptor=r.registry.get(appId,table.id),field=table.fields[0]
   for(let index=0;index<rowsPerTable;index++){
    const ordinal=group*rowsPerTable+index,id='01'+String(ordinal).padStart(24,'0'),row={...encodeValues(descriptor,{[field.id]:index%7?'Native 😀 '+ordinal:null},true),id,version:1,created_at:h.ctx.now,updated_at:h.ctx.now,lifecycle:descriptor.schema.lifecycle.initial,schema_version:descriptor.schema.version},expected={destination:appId,targetKind:'record:'+table.id,targetId:id,value:{row},revision:'import:'+String(ordinal).padStart(36,'0')+':'+('a'.repeat(64))}
    for(const statement of target.write(expected))execute(statement)
    effects.push({provenance:{id:'scale-effect-'+ordinal},expected,retained:false})
   }
  }
  h.sql.exec('COMMIT')
 }catch(error){h.sql.exec('ROLLBACK');h.close();throw error}
 return {h,r,appId,tables,target,effects}
}

/** Records the real prepared SQL executed by the production target and guards. */
export function countedUndoDatabase(db){
 const calls=[],raw=new WeakMap()
 const record=query=>{checkSql(query);calls.push(query);for(const value of query.params??[])if(typeof value==='string'&&Buffer.byteLength(value)>500000)throw new Error('Unbounded native undo parameter')}
 const wrap=(statement,query)=>{const result={bind(...params){return wrap(statement.bind(...params),{sql:query.sql,params})},async first(...args){record(query);return statement.first(...args)},async all(...args){record(query);return statement.all(...args)},async run(...args){record(query);return statement.run(...args)}};raw.set(result,{statement,query});return result}
 return {calls,database:{prepare(sql){return wrap(db.prepare(sql),{sql,params:[]})},async batch(statements){return db.batch(statements.map(statement=>{const item=raw.get(statement);record(item.query);return item.statement}))}}}
}
export async function exactUndoGuardsPass(db,guards){
 const results=await db.batch(guards.map(guard=>db.prepare('SELECT ('+guard.sql+') AS ok').bind(...(guard.params??[]))))
 return results.every(result=>result.results[0]?.ok===1)
}

export function seedOutsideUndoRows(x){
 const prior=x.r.registry.get(x.appId,x.tables[0].id),appId=createUlid(),id=createUlid(),name={id:createUlid(),label:'Outside name',type:'text',required:false,unique:false},relations=['one','many'].map(cardinality=>({id:createUlid(),label:'Outside '+cardinality,type:'relation',required:false,unique:false,relation:{ownerAppId:x.appId,entityId:prior.schema.id,cardinality,onDelete:'restrict'}})),schema={...prior.schema,appId,id,label:'Outside owners',primaryFieldId:name.id,fields:[name,...relations]},compiled=compileSchema(schema,(app,entity)=>x.r.registry.get(app,entity)),descriptor=compiled.descriptor
 for(const sql of compiled.sql)x.h.sql.exec(sql)
 const registry=createDescriptorRegistry([...x.r.registry.list(),descriptor]),one=descriptor.fields.get(relations[0].id),many=descriptor.fields.get(relations[1].id),columns=descriptor.table.writableColumnIds,insert=x.h.sql.prepare(`INSERT INTO "${descriptor.table.tableId}"(${columns.map(column=>'"'+column+'"').join(',')}) VALUES(${columns.map(()=>'?').join(',')})`),insertJoin=x.h.sql.prepare(`INSERT INTO "${many.join.table.tableId}"(id,record_id,value,position) VALUES(?,?,?,?)`),owners=[]
 x.h.sql.exec('BEGIN')
 try{for(const [index,effect]of x.effects.entries()){
  const recordId='02'+String(index).padStart(24,'0'),ref={appId:x.appId,entityId:prior.schema.id,recordId:effect.expected.targetId},row={...encodeValues(descriptor,{[name.id]:'Outside '+index,[one.field.id]:ref,[many.field.id]:[ref]},true),id:recordId,version:1,created_at:x.h.ctx.now,updated_at:x.h.ctx.now,lifecycle:schema.lifecycle.initial,schema_version:schema.version}
  insert.run(...columns.map(column=>row[column]??null));insertJoin.run('03'+String(index).padStart(24,'0'),recordId,ref.recordId,0);owners.push(recordId)
 }x.h.sql.exec('COMMIT')}catch(error){x.h.sql.exec('ROLLBACK');throw error}
 return {descriptor,registry,one,many,owners,target:createNativeImportTarget(registry)}
}
