import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {emittedRuntime} from './helpers/emitted-runtime.mjs'
import {installLegacyFixture} from './helpers/install-legacy-fixture.mjs'
import {installUiRepairsFixture} from './ui-repairs-fixture.mjs'
import {baseHttpSession} from './helpers/base-http-session.mjs'
import {freePort} from './helpers/free-port.mjs'
import {repairProviderEdge} from './repair-outcome-edge.mjs'
import {issueReviewedGrant} from './repair-outcome-grant-checks.mjs'
const {createUlid}=await import('../src/core/shared/ids.ts')
const model=await import('../src/apps/repairs/model.ts')
const {repairDescriptors}=await import('../src/apps/repairs/descriptors.ts')
const {environmentKeyring,seal}=await import('../src/domains/connections/crypto.server.ts')
export async function repairOutcomeFixture(){
 const directory=await mkdtemp(path.join(tmpdir(),'cradle-repair-outcome-')),port=await freePort(),origin=`http://127.0.0.1:${port}`,edge=repairProviderEdge()
 let runtime
 try{
  const migration=spawnSync(process.execPath,['scripts/migrate-local.mjs','--persist-to',directory],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(migration.status,0,migration.stderr+migration.stdout)
  const owner=await installLegacyFixture(directory,{installationOwner:true}),fixture=await installUiRepairsFixture(directory,owner)
  const key=Buffer.alloc(32,9).toString('base64url')
  runtime=await emittedRuntime(directory,port,{AUTH_LOCAL:'true',OWNER_EMAIL:'maya@northstar.example',MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test',SESSION_SECRET:'test-only-session-secret-32-characters-long',APP_ORIGIN:origin,CONNECTION_ENCRYPTION_KEY_VERSION:'test',CONNECTION_ENCRYPTION_KEY:key},edge.fetch)
  await runtime.ready
  const db=await runtime.getD1Database('DB'),now=new Date().toISOString(),manager='01ARZ3NDEKTSV4RRFFQ69G5FAB',other='01ARZ3NDEKTSV4RRFFQ69G5FAC'
  const policy=(await db.prepare('SELECT p.* FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind(owner,model.REPAIRS_APP_ID).first())
  const actions=['connection.read','connection.configure','connection.check','execution.read','execution.reconcile','attempt.reconcile','attempt.recover','run.retry','run.cancel','grant.prepare','grant.issue','grant.revoke','repair.configure-accounting']
  const rules=JSON.parse(policy.rules_json).map(rule=>({...rule,principals:[owner,manager,other].map(id=>({id,kind:'human'})),actions:[...rule.actions,...actions],purposes:['read','provider_context']}))
  await db.prepare('UPDATE authority_policies SET rules_json=? WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
  for(const id of [manager,other])await db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,?,?,0,'active',1)").bind(id,model.REPAIRS_APP_ID,policy.id).run()
  await db.prepare('UPDATE repair_configuration SET manager_id=?').bind(manager).run()
  await db.prepare("INSERT INTO app_releases(id,app_id,version,state,source_hash,detail_json,created_at,updated_at) VALUES(?,?,1,'live','test-repair-source','{}',?,?)").bind(model.REPAIRS_RELEASE_ID,model.REPAIRS_APP_ID,now,now).run()
  await db.prepare("INSERT INTO live_app_releases(app_id,release_id,source_hash,schema_revision,policy_version,action_version,deployment_id) VALUES(?,?,'test-repair-source','0606',1,1,'test-only')").bind(model.REPAIRS_APP_ID,model.REPAIRS_RELEASE_ID).run()
  const connections={calendar:createUlid(),xero:createUlid()}
  for(const [kind,id] of Object.entries(connections)){
   const adapter=kind==='calendar'?'google-calendar':'xero',account=kind==='calendar'?'test-calendar':'00000000-0000-4000-8000-000000000001'
   const scopes=[{resource:account,readFields:[],actions:kind==='calendar'?['repair.book-visit','repair.cancel-visit']:['repair.handoff-invoice']}]
   await db.prepare("INSERT INTO provider_connections(id,app_id,adapter_id,name,state,account_id,scopes_json,ownership_json,consent_scopes_json,version,last_checked_at,created_at,updated_at) VALUES(?,?,?,?,'connected',?,?,'[]','[]',1,?,?,?)").bind(id,model.REPAIRS_APP_ID,adapter,`Synthetic ${kind}`,account,JSON.stringify(scopes),now,now,now).run()
   const sealed=await seal(environmentKeyring('test',()=>key),'workspace',id,'oauth-tokens',JSON.stringify({accessToken:'synthetic-network-edge-only',refreshToken:'synthetic-refresh',expiresAt:'2099-01-01T00:00:00.000Z',scopes:[]}))
   await db.prepare('INSERT INTO connection_credentials(connection_id,sealed_json,expires_at,version,created_at,updated_at) VALUES(?,?,?,1,?,?)').bind(id,JSON.stringify(sealed),'2099-01-01T00:00:00.000Z',now,now).run()
  }
  const ownerSession=await baseHttpSession(origin),managerSession=await baseHttpSession(origin,'jordan@northstar.example'),otherSession=await baseHttpSession(origin,'samira@northstar.example')
  async function read(route,session=ownerSession){const response=await fetch(origin+route,{headers:{cookie:session.cookie}}),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.data}
  async function post(action,input,expected=[],{session=ownerSession,commandId=createUlid(),controlEpoch=(action.startsWith('repair.')&&action!=='repair.configure-accounting'||action.startsWith('decision.'))?0:undefined,status=200}={}){const response=await fetch(origin+'/api/v1/commands/'+action,{method:'POST',headers:{cookie:session.cookie,origin,'content-type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify({commandId,input,expected,...(controlEpoch===undefined?{}:{controlEpoch})})}),body=await response.json();assert.equal(response.status,status,`${action}: ${JSON.stringify(body)}`);return {body,value:body.data?.value,commandId}}
  async function source(text){const captured=await post('source.capture',{appId:model.REPAIRS_APP_ID,kind:'form',text,fileIds:[],subject:model.repairRef('stores',fixture.storeId)});const s=await read('/api/v1/sources/'+captured.value.id);return {sourceId:s.id,sourceVersion:s.version,locator:{kind:'text',start:0,end:text.length},observedAt:s.knownAt}}
  async function ref(entity,id){return {ref:model.repairRef(entity,id),version:(await db.prepare('SELECT version FROM '+model.REPAIR_MODEL[entity].table+' WHERE id=?').bind(id).first()).version}}
  async function issuedGrant(){const startsAt=new Date(Date.now()-1000).toISOString(),expiresAt=new Date(Date.now()+3600000).toISOString(),field=model.repairFieldId('workOrders','scope_hash'),actions=['repair.book-visit','repair.cancel-visit','repair.handoff-invoice','repair.store-acceptance'],spec={delegate:{kind:'human',id:owner},appId:model.REPAIRS_APP_ID,actions,scope:Object.values(model.REPAIR_ENTITIES).map(entityId=>({entityId})),allowedTransitions:[],perAction:[{minor:'500000',currency:'AUD',scale:2}],perActionQuantity:1,period:{startsAt,endsAt:expiresAt,ceiling:[{minor:'10000000',currency:'AUD',scale:2}],modelCalls:0,wallSeconds:10000,quantity:100},providerScopes:Object.values(connections).map(connectionId=>({connectionId,fields:[field],purposes:['repair']})),startsAt,expiresAt,decisionRules:[]}
   const issued=await issueReviewedGrant({post,db},spec)
   const mandate=JSON.parse((await db.prepare('SELECT data_json FROM operation_mandates WHERE id=?').bind(fixture.mandateId).first()).data_json)
   mandate.constraints=['Only reviewed exact repair commitments within the owner-issued grant'];mandate.actionIds=actions;mandate.grants=Object.fromEntries(actions.map(action=>[action,{grantId:issued.value.id,grantVersion:issued.value.version,purpose:'repair',fieldIds:[field]}]));mandate.budget.limit=spec.period.ceiling;mandate.budget.timeRemainingSeconds=10000
   await db.prepare('UPDATE operation_mandates SET data_json=? WHERE id=?').bind(JSON.stringify(mandate),mandate.id).run()
   return {grant:issued.value,spec}
  }
  async function waitAttempt(id){for(let i=0;i<100;i++){const row=await db.prepare('SELECT * FROM execution_attempts WHERE id=?').bind(id).first();if(row&&['confirmed','refused','unknown'].includes(row.state))return row;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('Provider attempt did not settle')}
  return {...model,db,runtime,origin,edge,fixture,owner,manager,other,rules,policyId:policy.id,ownerSession,managerSession,otherSession,connections,read,post,source,ref,issuedGrant,waitAttempt,id:createUlid,close:async()=>{await runtime.dispose();await rm(directory,{recursive:true,force:true})}}
 }catch(error){await runtime?.dispose();await rm(directory,{recursive:true,force:true});throw error}
}
