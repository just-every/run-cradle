import {harness} from './records-manual-harness.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {createNativeImportTarget} from '../../src/domains/records/base-transfer/target.server.ts'
import {importAuthority} from '../../src/domains/records/base-transfer/authority.server.ts'
import {nativeSource,mappingVersion} from '../../src/domains/records/base-transfer/storage.server.ts'
import {createD1ImportJob,planD1Import,resumeD1Import,undoD1Import,readD1ImportOriginals,readD1PersistedImport,sha256} from '../../vendor/base/modules/import-kit/src/d1/index.ts'
export const field=(label,type='text')=>({id:createUlid(),label,type,required:false,unique:false})
export async function setup(storage,cardinality='many'){
 const h=await harness(storage),appId=createUlid(),tableId=createUlid(),name=field('Number','number'),relation=field('Links','relation');relation.relation={ownerAppId:appId,entityId:tableId,cardinality,onDelete:'restrict'}
 const draft={appId,name:'Native import',tables:[{id:tableId,label:'Nodes',primaryFieldId:name.id,fields:[name,relation]}]};const {r}=await h.create(draft),ids=[createUlid(),createUlid()],location={artifact:'Nodes.csv',row:2},bytes=Buffer.from('Number,Links\r\n1,2\r\n2,1\r\n'),source={format:'csv-set',namespace:appId,bundle:{artifacts:[{name:'Nodes.csv',sha256:sha256(bytes),size:bytes.length,original:{status:'available',base64:bytes.toString('base64')}}],records:[],diagnostics:[]},tables:[{key:'Nodes.csv',label:'Nodes',columns:[{key:'Number',label:'Number'},{key:'Links',label:'Links'}],rows:ids.map((_,i)=>({key:String(i),values:{Number:String(i+1),Links:String(2-i)},location:{...location,row:i+2}}))}]}
 const preview={source,identities:{appId,tables:{}},records:ids.map((recordId,i)=>({tableKey:'Nodes.csv',rowKey:String(i),entityId:tableId,recordId,fields:{[name.id]:String(i+1)},location:{...location,row:i+2}})),links:ids.map((recordId,i)=>({tableKey:'Nodes.csv',rowKey:String(i),entityId:tableId,recordId,fieldId:relation.id,targetEntityId:tableId,targetRecordIds:[ids[1-i]],cardinality,location:{...location,row:i+2}}))}
 const auth=await importAuthority(h.db,r.policy,h.ctx,appId),target=createNativeImportTarget(r.registry),context={destination:appId,namespace:appId,mappingVersion,storage:{database:h.db,targets:target},authorization:{principalId:h.owner,predicate:()=>auth},batchSize:1,maxBatches:1},native=nativeSource(preview,r.registry,h.ctx.now),plan=await planD1Import(native.source,native.mapping,context),job=await createD1ImportJob(plan,{...context,reviewedFingerprint:plan.fingerprint})
 return {h,r,ids,appId,tableId,name,relation,context,job,bytes}
}
