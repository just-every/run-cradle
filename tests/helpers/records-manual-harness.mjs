import './typescript-loader.mjs'
import {migratedD1} from './sqlite-d1.mjs'
import {prepareCanonicalInvalidation} from '../../src/domains/evidence/canonical-invalidation.server.ts'
import {createUlid} from '../../src/core/shared/ids.ts'
import {createManualSchemas} from '../../src/domains/records/manual/service.server.ts'
import {loadDescriptorRegistry} from '../../src/domains/records/loader.server.ts'
import {createApplicationEntityRegistry} from '../../src/core/app/composition/entities.server.ts'
import {createPolicyPort} from '../../src/domains/authority/policy.server.ts'
import {createAdmissionService} from '../../src/domains/admission/service.server.ts'
import {createReplayAccess} from '../../src/domains/authority/context.server.ts'
import {createRecordServices} from '../../src/domains/records/service.server.ts'
import {createCommandRegistry} from '../../src/core/registry/commands.ts'
import {registerRecordActions} from '../../src/domains/records/actions.server.ts'
import {createRecordsCsv} from '../../src/domains/records/csv.server.ts'
import {templateBase} from '../../src/ui/records/schema/templates.ts'
export async function harness(storage=migratedD1()){
 const h=storage,owner=createUlid(),session=createUlid(),now=new Date().toISOString(),time=Date.now()
 await h.db.prepare('INSERT INTO operators(id,name,email,active,created_at,updated_at,version) VALUES(?,?,?,1,?,?,1)').bind(owner,'Schema owner','schema-owner@example.test',time,time).run()
 await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES(?,'human',?,'active',1,?,?)").bind(owner,owner,time,time).run()
 await h.db.prepare('INSERT INTO authority_sessions(id,principal_id,token_hash,csrf_hash,authentication_epoch,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,1,?,?,?)').bind(session,owner,createUlid(),createUlid(),time,time,time+3600000).run()
 const ctx={principal:{id:owner,kind:'human',humanId:owner,sessionId:session,credentialId:null,authenticationEpoch:1,issuedAt:now,expiresAt:new Date(time+3600000).toISOString()},now,requestId:createUlid(),ingress:'http'}
 async function runtime(wrap=x=>x){const registry=await loadDescriptorRegistry(h.db,[]),entities=createApplicationEntityRegistry(registry),policy=createPolicyPort(h.db,entities),admission=wrap(createAdmissionService(h.db,createReplayAccess(h.db,policy,entities))),manual=createManualSchemas(h.db,policy,admission,registry),services=createRecordServices(h.db,registry,policy,'manual-schema-test-secret-long-enough',undefined,undefined,(ctx,change)=>prepareCanonicalInvalidation(h.db,ctx,change.before)),commands=createCommandRegistry(admission);registerRecordActions(commands,{...services,deleteEffects:async()=>{throw new Error('deletion unsupported')}});return {registry,policy,admission,manual,services,commands,csv:createRecordsCsv(h.db,services,admission)}}
 async function create(draft=templateBase('crm')){const r=await runtime(),p=await r.manual.preview(ctx,draft),result=await r.manual.adopt(ctx,createUlid(),p.id);return {draft,preview:p,release:result.result.value,r:await runtime()}}
 return {...h,owner,session,ctx,runtime,create}
}
export async function add(h,r,table,values){return (await r.commands.get('record.create').execute(h.ctx,{commandId:createUlid(),expected:[{ref:{appId:table.appId,entityId:'00000000000000000000000001',recordId:table.id},version:table.version}],input:{appId:table.appId,entityId:table.id,values}})).result.value}
