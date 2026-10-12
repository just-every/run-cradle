import {createUlid} from '../../src/core/shared/ids.ts'
import {compileSchema} from '../../src/domains/records/descriptors.server.ts'
import {ownerRules} from '../../src/domains/records/manual/authority.server.ts'
import {encodeValues} from '../../src/domains/records/codec.server.ts'
/** A native registered app may link across apps although the manual builder
 * only authors within-base links. Use the real compiler and real policy rows. */
export async function outsideDependency(x){
 const appId=createUlid(),entityId=createUlid(),recordId=createUlid(),name={id:createUlid(),label:'Hidden business label',type:'text',required:false,unique:false},link={id:createUlid(),label:'Hidden dependency label',type:'relation',required:false,unique:false,relation:{ownerAppId:x.appId,entityId:x.table.entityId,cardinality:'one',onDelete:'restrict'}},schema={...x.descriptor.schema,appId,id:entityId,label:'Hidden app table',primaryFieldId:name.id,fields:[name,link],incomingRelations:[]},compiled=compileSchema(schema,(app,entity)=>x.r.registry.get(app,entity))
 for(const sql of compiled.sql)await x.h.db.prepare(sql).run()
 await x.h.db.prepare('INSERT INTO record_schemas(id,app_id,version,physical_revision,schema_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(entityId,appId,schema.version,schema.physicalRevision,JSON.stringify(schema),x.h.ctx.now,x.h.ctx.now).run()
 const d=compiled.descriptor,row={...encodeValues(d,{[name.id]:'Secret outside row',[link.id]:{appId:x.appId,entityId:x.table.entityId,recordId:x.ids[0]}},true),id:recordId,version:1,created_at:x.h.ctx.now,updated_at:x.h.ctx.now,lifecycle:schema.lifecycle.initial,schema_version:schema.version},keys=Object.keys(row)
 await x.h.db.prepare(`INSERT INTO "${d.table.tableId}"(${keys.map(k=>'"'+k+'"').join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).bind(...keys.map(k=>row[k])).run()
 const policyId=createUlid(),rules=ownerRules(x.h.owner,[schema]);await x.h.db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(policyId,appId,'External fixture policy',JSON.stringify(rules),Date.now(),Date.now()).run();await x.h.db.prepare('INSERT INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,?,?,0,\'active\',1)').bind(x.h.owner,appId,policyId).run()
 return {appId,entityId,recordId,name,link,policyId,rules,descriptor:d}
}
