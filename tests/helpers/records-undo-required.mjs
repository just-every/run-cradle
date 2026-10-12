import {harness,add} from './records-manual-harness.mjs'
import {applyPreview} from './base-exit-runtime.mjs'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {createUlid} from '../../src/core/shared/ids.ts'
import {createBaseExport} from '../../src/domains/records/base-transfer/export-json.server.ts'
import {prepareJsonSource,allocateJsonIdentities} from '../../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../../src/domains/records/base-transfer/plan-json.ts'
import {jsonIdentityMap} from '../../src/domains/records/base-transfer/json-remap.ts'
import {importAuthority} from '../../src/domains/records/base-transfer/authority.server.ts'
import {createNativeImportTarget} from '../../src/domains/records/base-transfer/target.server.ts'

export async function requiredUndoSetup(batchSize=1,storage){
 const h=await harness(storage),appId=createUlid(),grand={id:createUlid(),label:'Grandparents',fields:[newField('Name')]},parent={id:createUlid(),label:'Parents',fields:[newField('Name')]},child={id:createUlid(),label:'Children',fields:[newField('Name')]}
 for(const table of [grand,parent,child])table.primaryFieldId=table.fields[0].id
 for(const [owner,target]of [[parent,grand],[child,parent]])for(const cardinality of ['one','many'])owner.fields.push({...newField('Required '+cardinality,'relation'),required:true,relation:{ownerAppId:appId,entityId:target.id,cardinality,onDelete:'restrict'}})
 const {r}=await h.create({appId,name:'Required preservation',tables:[child,parent,grand]}),g=await add(h,r,r.registry.get(appId,grand.id).schema,{[grand.fields[0].id]:'Grandparent'}),free=await add(h,r,r.registry.get(appId,grand.id).schema,{[grand.fields[0].id]:'Unrelated'}),p=await add(h,r,r.registry.get(appId,parent.id).schema,{[parent.fields[0].id]:'Parent',[parent.fields[1].id]:g.ref,[parent.fields[2].id]:[g.ref]}),c=await add(h,r,r.registry.get(appId,child.id).schema,{[child.fields[0].id]:'Child',[child.fields[1].id]:p.ref,[child.fields[2].id]:[p.ref]}),snapshot=await createBaseExport(h.db,r.services)(h.ctx,appId),bytes=new TextEncoder().encode(JSON.stringify(snapshot)),source=prepareJsonSource({filename:'required.json',bytes}),identities=allocateJsonIdentities(snapshot,'copy'),map=jsonIdentityMap(snapshot,identities),preview=previewJsonImport(source,{name:snapshot.base.name},identities),applied=await applyPreview(h,preview),authority=await importAuthority(h.db,applied.r.policy,h.ctx,identities.appId),context={destination:identities.appId,namespace:source.namespace,mappingVersion:'cradle-native-base-v1',storage:{database:h.db,targets:createNativeImportTarget(applied.r.registry)},authorization:{principalId:h.owner,predicate:()=>authority},batchSize,maxBatches:1}
 const node=(table,record)=>({descriptor:applied.r.registry.get(identities.appId,map.get(table.id)),id:map.get(record.ref.recordId),name:map.get(table.fields[0].id)})
 return {h,...applied,context,appId:identities.appId,bytes,nodes:{grand:node(grand,g),parent:node(parent,p),child:node(child,c),free:node(grand,free)}}
}
export async function assertRequiredNativeValidity(x,assert){
 for(const d of x.r.registry.list(x.appId))for(const f of d.fields.values())if(f.field.type==='relation'&&f.field.required&&f.join)assert.equal((await x.h.db.prepare(`SELECT COUNT(*) n FROM "${d.table.tableId}" r WHERE NOT EXISTS(SELECT 1 FROM "${f.join.table.tableId}" j WHERE j.record_id=r.id)`).first()).n,0,'Every live required-MANY owner remains valid after each committed batch')
 assert.equal((await x.h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
}
