import test from 'node:test'
import assert from 'node:assert/strict'
import {environment} from './launch-support.mjs'
test('[AUTH-LEGACY] exact retained context and export mapping rejects unrelated authority',async()=>{
 const e=await environment();try{
 const {r,db,actor}=e,now=new Date().toISOString(),surface=r.legacyLaunchSurface(r.launchEntities.campaign)
 const policy={id:r.createUlid(),appId:r.LAUNCH_APP_ID,version:1,createdAt:now,updatedAt:now,name:'Legacy test',rules:[{id:r.createUlid(),principals:[{kind:'human',id:actor}],entityId:r.launchEntities.campaign,rows:{kind:'all',conditions:[]},readableFields:surface.fields,writableFields:surface.fields,actions:surface.actions,effect:'allow',purposes:['read','export','provider_context']}]}
 const apply=policy=>r.initializeLegacyAuthority(db,{initialOwnerId:actor,launchAppId:r.LAUNCH_APP_ID,policies:[policy],memberships:[{memberId:actor,policyId:policy.id}]})
 await apply(policy)
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM authority_grants').first()).n,0)
 for(const change of [{entityId:r.createUlid()},{actions:['launch.provider.send']},{readableFields:[r.createUlid()]},{purposes:['arbitrary']},{principals:[{kind:'agent',id:actor}]},{entityId:r.launchEntities.customField,readableFields:Object.values(r.launchFieldIds.customField),writableFields:[],actions:[],purposes:['provider_context']}])await assert.rejects(()=>apply({...policy,id:r.createUlid(),rules:[{...policy.rules[0],...change}]}))
 await assert.rejects(()=>apply({...policy,appId:r.createUlid()}))
 }finally{await e.close()}
})
test('[UPGRADE-LEGACY] shipped definitions adopt original identities without duplicate automations',async()=>{
 const e=await environment();try{
 const {db,r,actor}=e
 await db.prepare('DELETE FROM automations').run()
 const definitions=[['Critical risk escalation','event',{event:'risk.updated.v1'},['escalate-risk']],['Launch readiness','schedule',{hour:8,leadDays:5},['notify-operator']],['Campaign brief','event',{event:'campaign.updated.v1'},['request-ai-analysis']],['Weekly portfolio digest','schedule',{weekday:'Monday',hour:9},['send-email']]]
 const ids=[]
 for(const [name,type,config,actions]of definitions){const id=r.createUlid();ids.push(id);await db.prepare('INSERT INTO automations(id,created_at,updated_at,version,name,trigger_type,trigger_config_json,actions_json,enabled,definition_version) VALUES(?,1,1,3,?,?,?,?,0,1)').bind(id,name,type,JSON.stringify(config),JSON.stringify(actions)).run()}
 await db.batch(await r.prepareLaunchSetup(db,actor));await db.batch(await r.prepareLaunchSetup(db,actor))
 const rows=(await db.prepare('SELECT id,version,enabled,shipped_key FROM automations').all()).results
 assert.equal(rows.length,4);assert.deepEqual(rows.map(x=>x.id).sort(),ids.sort());assert.ok(rows.every(x=>x.version===3&&x.enabled===0&&x.shipped_key))
 }finally{await e.close()}
})
test('[AUTH-LEGACY-N] retained channel rights cannot expose another operator private rows',async()=>{
 const e=await environment();try{const {r,db,actor}=e,now=new Date().toISOString(),policy={id:r.createUlid(),appId:r.LAUNCH_APP_ID,name:'Retained channels',version:1,createdAt:now,updatedAt:now,rules:r.channelLegacyPolicyRules(actor)}
 const apply=p=>r.initializeLegacyAuthority(db,{initialOwnerId:actor,launchAppId:r.LAUNCH_APP_ID,policies:[p],memberships:[{memberId:actor,policyId:p.id}]})
 await apply(policy)
 const personal=policy.rules.find(x=>x.entityId===r.CHANNEL_ENTITIES.notification)
 for(const patch of [{rows:{kind:'all',conditions:[]}},{rows:{kind:'condition',fieldId:r.CHANNEL_FIELDS.owner,op:'eq',value:r.createUlid()}},{actions:['notification.read-any']},{entityId:r.createUlid()},{purposes:['provider_context']}])await assert.rejects(()=>apply({...policy,id:r.createUlid(),rules:[{...personal,...patch}]}))
 }finally{await e.close()}
})
test('[AUTH-LEGACY-CSV] only retained import entities and exact import-only staging are adopted',async()=>{
 const e=await environment();try{const {r,db,actor}=e,now=new Date().toISOString(),policy={id:r.createUlid(),appId:r.LAUNCH_APP_ID,name:'Retained CSV',version:1,createdAt:now,updatedAt:now,rules:r.legacyImportStagingRules(actor,r.createUlid(),r.createUlid())}
 const apply=p=>r.initializeLegacyAuthority(db,{initialOwnerId:actor,launchAppId:r.LAUNCH_APP_ID,policies:[p],memberships:[{memberId:actor,policyId:p.id}]})
 await apply(policy);assert.ok(r.legacyLaunchSurface(r.launchEntities.campaign).actions.includes('import.commit'));assert.ok(!r.legacyLaunchSurface(r.launchEntities.risk).actions.includes('import.commit'))
 const row=policy.rules[1]
 for(const patch of [{actions:['source.capture']},{actions:['privacy.erase']},{rows:{kind:'all',conditions:[]}},{rows:{kind:'condition',fieldId:r.STAGING_PURPOSE,op:'eq',value:'source'}},{purposes:['provider_context']},{principals:[{kind:'human',id:r.createUlid()}]}])await assert.rejects(()=>apply({...policy,id:r.createUlid(),rules:[{...row,...patch}]}))
 await assert.rejects(()=>apply({...policy,appId:r.createUlid()}))
 }finally{await e.close()}
})
