import {readFile,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{build}=require('../node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild'),{Miniflare,convertV4MiniflareOptions}=require('../node_modules/.pnpm/miniflare@5.20260907.0-alpha/node_modules/miniflare')
export async function environment(){
 const dir=await mkdtemp(join(tmpdir(),'cradle-launch-')),mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-07',d1Databases:{DB:'launch-isolated'}}))
 try{
 await build({entryPoints:['tests/launch-runtime-entry.ts'],outfile:join(dir,'runtime.mjs'),bundle:true,platform:'node',format:'esm'});const r=await import(join(dir,'runtime.mjs')),db=await mf.getD1Database('DB')
 for(const file of ['0000_foundation.sql','0001_portfolio_spine.sql','0100_authority.sql','0200_relational_records.sql','0300_atomic_admission.sql','0700_launch_completion.sql','0701_launch_automation.sql','0702_launch_search.sql','0703_launch_analysis_requests.sql','0704_launch_analysis_context.sql','0705_launch_run_attribution.sql','0706_launch_tag_projection.sql','1200_channels.sql','1201_channel_mail_authority.sql','1202_channel_event_lineage.sql','1220_launch_runtime.sql'])await db.exec((await readFile('migrations/core/'+file,'utf8')).replace(/^--.*$/gm,'').replaceAll('\n',' '))
 const actor=r.createUlid(),now=new Date().toISOString(),millis=Date.parse(now)
 await db.prepare('INSERT INTO operators VALUES(?,?,?,1,?,?,1)').bind(actor,millis,millis,'Owner','owner@example.test').run()
 await db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)").bind(actor,actor,millis,millis).run()
 await db.prepare("INSERT INTO workspace_settings(id,created_at,updated_at,version,workspace_name,timezone,currency,quiet_hours_start,quiet_hours_end) VALUES('settings',?,?,1,'Workspace','Pacific/Auckland','NZD','18:00','08:00')").bind(millis,millis).run()
 await db.batch(await r.prepareLaunchSetup(db,actor,millis))
 const principal={id:actor,kind:'human',humanId:actor,sessionId:null,credentialId:null,issuedAt:now,expiresAt:'2099-01-01T00:00:00.000Z',authenticationEpoch:1},ctx={principal,requestId:r.createUlid(),now,ingress:'http'}
 const permit=req=>({actor:{id:actor,kind:'human'},action:req.action,appId:r.LAUNCH_APP_ID,grantId:null,grantVersion:null,policyVersion:1,validUntil:principal.expiresAt,guards:[],reservationMutations:[],reservationIds:[]})
 const policy={authorize:async(_ctx,req)=>permit(req),scope:async(_ctx,req)=>({principal,appId:r.LAUNCH_APP_ID,entityId:req.entityId,policyVersion:1,rowPredicate:r.trustedPredicate('1'),readableFieldIds:r.launchDescriptors.find(d=>d.schema.id===req.entityId).schema.fields.map(f=>f.id),writableFieldIds:[],discoverableRelations:[],validUntil:principal.expiresAt,currentAuthorityGuards:[]})}
 const integration=r.createChannelsIntegration(db)
 const context={db,policy,integration},admission=r.createAdmissionService(db,{authorizeReplay:async()=>{}}),handlers=r.createLaunchHandlers(context)
 const command=(action,input,expected=[])=>r.launchCommandSchema(action).parse({commandId:r.createUlid(),expected,input})
 const prepare=(action,input,expected=[])=>handlers[action](ctx,command(action,input,expected))
 const commit=async(action,input,expected=[])=>{const p=await prepare(action,input,expected);const res=await admission.commit(ctx,p);return res.result.value}
 const expected=(kind,row)=>[{ref:{appId:r.LAUNCH_APP_ID,entityId:r.launchEntities[kind],recordId:row.id},version:row.version}]
 const campaign=async(code='TEST',ownerId=actor)=>commit('campaign.create',{fields:{code,name:'Campaign '+code,ownerId,startDate:'2026-01-01',launchDate:'2026-10-01',objective:'Launch',statusSummary:'Ready',phase:'Planning',status:'On track',health:75,budgetMinor:100,spendMinor:0,tags:[],customFields:{}}})
 return{r,db,ctx,actor,context,policy,permit,admission,handlers,command,prepare,commit,expected,campaign,close:async()=>{await mf.dispose();await rm(dir,{recursive:true,force:true})}}
 }catch(error){await mf.dispose();await rm(dir,{recursive:true,force:true});throw error}
}
