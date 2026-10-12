import './typescript-loader.mjs'
import {DatabaseSync} from 'node:sqlite'
import {migrationInventory} from '../../scripts/migration-groups.mjs'
import {harness} from './records-manual-harness.mjs'
import {prepareCsvSource,allocateImportIdentities} from '../../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../../src/domains/records/base-transfer/plan.ts'
import {createBaseImportService} from '../../src/domains/records/base-transfer/service.server.ts'
import {nativeSource,mappingVersion} from '../../src/domains/records/base-transfer/storage.server.ts'
import {createNativeImportTarget} from '../../src/domains/records/base-transfer/target.server.ts'
import {importAuthority} from '../../src/domains/records/base-transfer/authority.server.ts'
import {createD1ImportJob,planD1Import} from '../../vendor/base/modules/import-kit/src/d1/index.ts'

export function undoSqlite(filename=':memory:',initialize=true) {
 const sql=new DatabaseSync(filename);sql.exec('PRAGMA foreign_keys=ON')
 if(initialize)for(const {sql:migration} of migrationInventory())sql.exec(migration)
 const prepare=text=>{let args=[];const execute=()=>{const statement=sql.prepare(text);if(statement.columns().length)return {success:true,results:statement.all(...args),meta:{changes:0}};const r=statement.run(...args);return {success:true,results:[],meta:{changes:Number(r.changes)}}};const statement={bind(...values){args=values;return statement},async first(){return sql.prepare(text).get(...args)??null},async all(){return execute()},async run(){return execute()},execute};return statement}
 return {sql,db:{prepare,async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.execute());sql.exec('COMMIT');return result}catch(error){sql.exec('ROLLBACK');throw error}}},close:()=>sql.close()}
}
export function undoPreview(count=13,cardinality='many',{rejected=false,links=true}={}) {
 const bytes=Buffer.from(['Name,Links',...Array.from({length:count},(_,i)=>`Row ${i+1},${links?'Row '+((i+1)%count+1):''}`)].join('\r\n')+'\r\n'),source=prepareCsvSource([{filename:'Nodes.csv',bytes}]),identities=allocateImportIdentities(source),options={name:'Undo fixture',tables:{'Nodes.csv':{columns:{'column-1':{type:rejected?'number':'text'},'column-2':{type:'relation',relationTableKey:'Nodes.csv',cardinality}}}}}
 return {bytes,preview:previewBaseImport(source,options,identities)}
}
export async function undoSetup({storage,count=13,cardinality='many',direct=false,batchSize=20,rejected=false,links=true}={}) {
 const h=await harness(storage),r=await h.runtime(),{bytes,preview}=undoPreview(count,cardinality,{rejected,links}),ack={fingerprint:preview.fingerprint,acceptLoss:true},service=createBaseImportService(h.db,r.policy,r.registry,r.manual,previewBaseImport)
 let job
 if(!direct){const review=await service.review(h.ctx,preview,ack);job=await service.adopt(h.ctx,review.reviewId,{...ack,physicalFingerprint:review.physicalFingerprint})}else await h.create(preview.schemaDraft)
 const live=await h.runtime(),appId=preview.identities.appId,table=preview.identities.tables['Nodes.csv'],descriptor=live.registry.get(appId,table.entityId),targets=createNativeImportTarget(live.registry),authority=await importAuthority(h.db,live.policy,h.ctx,appId),context={destination:appId,namespace:preview.source.namespace,mappingVersion,reversalPolicy:'preserve-conflicts',storage:{database:h.db,targets},authorization:{principalId:h.owner,predicate:()=>authority},batchSize,maxBatches:1}
 if(direct){const native=nativeSource(preview,live.registry,h.ctx.now),plan=await planD1Import(native.source,native.mapping,context);job=await createD1ImportJob(plan,{...context,reviewedFingerprint:plan.fingerprint})}
 const restart=()=>createBaseImportService(h.db,live.policy,live.registry,live.manual,()=>{throw new Error('Stored undo cannot require source or parser')})
 return {h,r:live,bytes,preview,appId,table,descriptor,ids:Object.values(table.records),job,context,service:restart(),restart}
}
