import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {emittedRuntime} from './emitted-runtime.mjs'
import {emittedMailRuntime} from './emitted-mail-runtime.mjs'
import { migrationInventory } from '../../scripts/migration-groups.mjs'
import {loadDescriptorRegistry} from '../../src/domains/records/loader.server.ts'
import {launchDescriptors} from '../../src/apps/launch/descriptors.server.ts'
import {repairDescriptors} from '../../src/apps/repairs/descriptors.ts'
import {stagingDescriptor} from '../../src/domains/evidence/staging.server.ts'
import {sourceIntakeDescriptor} from '../../src/domains/construction/intake.server.ts'
import {INSTALLATION_AUTHORITY_APP} from '../../src/domains/authority/pending-app.server.ts'
import {completeFirstRun} from './complete-first-run.mjs'
import {fixtureMessages} from './fixture-mail.mjs'
import {baseHttpSession} from './base-http-session.mjs'

/** Native Base owner and a real one-use emailed token captured at the provider edge.
 * No LOCAL_MEMBER_ID or injected production principal is used. */
export async function recordsImportBrowserRuntime(port=0,network={}) {
 const directory=await mkdtemp(path.join(tmpdir(),'records-base-owner-'))
 let origin=`http://127.0.0.1:${port}`
 const credentials={session:randomBytes(32).toString('hex'),setup:randomBytes(32).toString('hex')}
 const options={origin,email:'import-owner@example.test',name:'Import owner',workspace:'Import records',timezone:'UTC',currency:'USD'}
 const environment={APP_ORIGIN:origin,AUTH_LOCAL:'true',OWNER_EMAIL:options.email,SESSION_SECRET:credentials.session,SETUP_TOKEN:credentials.setup,WORKSPACE_NAME:options.workspace,WORKSPACE_TIMEZONE:options.timezone,WORKSPACE_CURRENCY:options.currency,MAIL_FROM:'auth@localhost.test',...network.bindings}
 let runtime,db,mail
 try {
  if(process.env.CRADLE_FIXTURE_PROGRESS)console.log('FIXTURE emitted-runtime')
  const fixture=await emittedMailRuntime(directory,port,environment,network.outbound)
  ;({runtime,mail,origin,port}=fixture);Object.assign(environment,fixture.bindings)
  if(process.env.CRADLE_FIXTURE_PROGRESS)console.log('FIXTURE d1-binding')
  db=await runtime.getD1Database('DB')
  if(process.env.CRADLE_FIXTURE_PROGRESS)console.log('FIXTURE migrations')
  for(const migration of migrationInventory())await db.exec(migration.sql.replace(/^\s*--.*$/gm,'').replaceAll('\n',' '))
  if(process.env.CRADLE_FIXTURE_PROGRESS)console.log('FIXTURE ready')
  await runtime.ready
  const post=(route,body)=>fetch(origin+route,{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
  const returnedCookies=response=>response.headers.getSetCookie().map(header=>header.split(';')[0]).join('; ')
  if(process.env.CRADLE_FIXTURE_PROGRESS)console.log('FIXTURE bootstrap')
  const bootstrap=await post('/auth/bootstrap',{token:credentials.setup,displayName:options.name,returnTo:'/app'})
  assert.equal(bootstrap.status,303)
  if(process.env.CRADLE_FIXTURE_PROGRESS)console.log('FIXTURE first-run')
  await completeFirstRun(origin,returnedCookies(bootstrap))
  const initialized=await fetch(origin+'/app',{headers:{cookie:returnedCookies(bootstrap)}});assert.equal(initialized.status,200);await initialized.arrayBuffer()
  if(process.env.CRADLE_FIXTURE_PROGRESS)console.log('FIXTURE mail-session')
  const {cookie}=await baseHttpSession(origin,options.email)
  assert.ok(cookie,'Magic-link confirmation returns session cookies')
  const session=await fetch(origin+'/auth/session',{redirect:'manual',headers:{cookie}});assert.equal(session.status,200,'Returned cookies authenticate the owner')
  const operator=(await session.json()).operator;assert.equal(operator.email,options.email);assert.equal(operator.role,'owner')
  const home=await fetch(origin+'/app',{redirect:'manual',headers:{cookie}})
  assert.equal(home.status,200,'Workspace establishes its native owner projection');await home.arrayBuffer()
  const apps=await fetch(origin+'/api/v1/apps',{redirect:'manual',headers:{cookie}});assert.equal(apps.status,200,'Confirmed owner can use the authenticated product API');assert.ok(Array.isArray((await apps.json()).data.items))
  return {get runtime(){return runtime},get db(){return db},origin,cookie,mailMessages:()=>fixtureMessages(origin),
  /** Stop the Worker process and start a new one over the same persisted D1. */
  async restart(bindingChanges={}){await runtime.dispose();Object.assign(environment,bindingChanges);for(const key of Object.keys(environment))if(environment[key]===undefined)delete environment[key];runtime=await emittedRuntime(directory,port,environment,mail.fetch);db=await runtime.getD1Database('DB');await runtime.ready},
  async descriptors(){
   // The native local installation includes the product's source-owned schemas.
   // Use its actual descriptors, as createLaunchFoundation does; an empty source
   // list incorrectly treats those custom physical tables as manual tables.
   const stored=await db.prepare('SELECT DISTINCT app_id FROM record_schemas').all(),sources=[...launchDescriptors,...repairDescriptors],apps=new Set([...sources.map(d=>d.schema.appId),...stored.results.map(r=>r.app_id)])
   return loadDescriptorRegistry(db,[...sources,sourceIntakeDescriptor(INSTALLATION_AUTHORITY_APP),...[...apps].map(stagingDescriptor)])
  },async close(){try{await runtime.dispose()}finally{await mail.close();await rm(directory,{recursive:true,force:true})}}}
 }catch(error){try{await runtime?.dispose()}finally{await mail?.close();await rm(directory,{recursive:true,force:true})}throw error}
}
