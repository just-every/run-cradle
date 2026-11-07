import test from 'node:test'
import assert from 'node:assert/strict'
import { launchAuthorityRuntime, LAUNCH_APP_ID, launchEntities, launchFieldIds, createUlid, prepareLaunchSetup, initializeLegacyAuthority } from './helpers/launch-authority-runtime.mjs'
import { adoptFixtureOperators } from './helpers/base-fixture-auth.mjs'

const { AUTHORITY_ENTITY_IDS } = await import('../src/domains/authority/contracts.ts')

const campaignsPath = `/api/v1/apps/${LAUNCH_APP_ID}/entities/${launchEntities.campaign}/records`
const body = async response => { assert.equal(response.status, 200, await response.clone().text()); return response.json() }

test('[APP-SCOPE-001 RECORDS-001] repeated setup preserves explicit scopes, revocation and edited policies', async () => {
  const h = await launchAuthorityRuntime()
  try {
    assert.equal((await h.db.prepare('SELECT count(*) n FROM authority_memberships WHERE app_id=?').bind(LAUNCH_APP_ID).first()).n,1,'First install maps only its explicit owner')
    const other = await h.addPerson({ appId: '00000000000000000000000600', name: 'Repair colleague' })
    const full = await h.addPerson()
    const unscoped = createUlid(), now = Date.now()
    await h.db.batch([
      h.db.prepare('INSERT INTO operators(id,created_at,updated_at,version,name,email,active) VALUES(?,?,?,1,?,?,1)').bind(unscoped,now,now,'Unmapped operator',`${unscoped}@example.test`),
      h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)").bind(unscoped,unscoped,now,now),
    ])
    await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=?").bind(full.id).run()
    const edited = JSON.parse(h.policy.rules_json).map(rule => ({ ...rule, actions: [] }))
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=2 WHERE id=?').bind(JSON.stringify(edited), h.policy.id).run()
    const snapshot = async () => Object.fromEntries(await Promise.all(['operators','authority_principals','authority_memberships','authority_policies','authority_sessions','campaigns','lenses','automations'].map(async table => [table, (await h.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results])))
    const before = await snapshot()
    for (let i = 0; i < 2; i++) await h.db.batch(await prepareLaunchSetup(h.db, h.owner))
    assert.deepEqual(await snapshot(), before)
    assert.deepEqual((await h.db.prepare('SELECT app_id FROM authority_memberships WHERE principal_id=?').bind(other.id).all()).results, [{ app_id: '00000000000000000000000600' }])
    // Deletion is also revocation; setup must not reconstruct a missing mapping.
    await h.db.prepare('DELETE FROM authority_memberships WHERE principal_id=?').bind(h.owner).run()
    const deleted = await snapshot()
    await h.db.batch(await prepareLaunchSetup(h.db, h.owner))
    assert.deepEqual(await snapshot(), deleted)
  } finally { await h.close() }
})

test('[BASE-ACCESS-004 RECORDS-001] every retained launch transport enforces current rows, fields and membership', async () => {
  const h = await launchAuthorityRuntime()
  try {
    const campaigns = await body(await h.request(h.ownerSession, '/api/campaigns'))
    const first = campaigns.items[0], risk = (await body(await h.request(h.ownerSession, '/api/risks/lens'))).items[0]
    const milestone = (await body(await h.request(h.ownerSession, '/api/milestones/timeline'))).items[0]
    const decision = (await body(await h.request(h.ownerSession, '/api/decisions'))).items[0]
    const lens = (await body(await h.request(h.ownerSession, '/api/lenses'))).items[0]
    const routes = ['/api/portfolio','/api/campaigns',`/api/campaigns/${first.id}`,'/api/risks/lens',`/api/risks/${risk.id}`,'/api/milestones/timeline',`/api/milestones/${milestone.id}`,'/api/decisions',`/api/decisions/${decision.id}`,'/api/lenses',`/api/lenses/${lens.id}`,'/api/automations','/api/automations/runs','/api/v1/launch/owners']
    const full = await h.addPerson({ name: 'Explicit launch colleague' })
    const legacyManager=await h.addPerson({name:'Retained legacy operator',legacy:true})
    const membersPath = `/api/v1/members?appId=${LAUNCH_APP_ID}`, grantsPath = `/api/v1/grants?appId=${LAUNCH_APP_ID}`, capabilitiesPath = `/api/v1/authority/capabilities?appId=${LAUNCH_APP_ID}`
    const authorityState = async () => ({mail:(await h.mailMessages()).length,...Object.fromEntries(await Promise.all(['authority_grants','authority_policies','authority_memberships','command_admissions','admission_audit','admission_outbox'].map(async table => [table, (await h.db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n])))})
    const beforeCapabilities = await authorityState()
    for (const session of [h.ownerSession, legacyManager.session]) {
      const members = (await body(await h.request(session, membersPath))).data
      assert.ok(members.items.some(member => member.id === legacyManager.id))
      const access = (await body(await h.request(session,capabilitiesPath))).data
      assert.equal(access.allowedActions.find(action => action.action === 'member.read').enabled,true)
      const capability = access.allowedActions.find(action => action.action === 'grant.read')
      assert.equal(capability.enabled, false, 'Legacy member management adds no grant-read authority')
      assert.ok(capability.reason)
      assert.equal((await h.request(session, grantsPath)).status, 403, 'Direct grant reads still enforce current policy')
    }
    assert.deepEqual(await authorityState(), beforeCapabilities, 'Capability reads change no grants, policies, memberships, actions or outboxes')
    const deniedMembers = await h.request(full.session, membersPath)
    assert.equal(deniedMembers.status,403,'A scoped collaborator receives no implicit management authority')
    assert.equal(Object.hasOwn(await deniedMembers.json(), 'data'), false, 'Denied member reads expose neither capabilities nor members')
    for(const appId of ['00000000000000000000000600',createUlid()]) {
      const inaccessible=await h.request(legacyManager.session,`/api/v1/authority/capabilities?appId=${appId}`)
      assert.equal(inaccessible.status,403,'Other-app and missing-app capability reads are equally denied')
      assert.equal(Object.hasOwn(await inaccessible.json(),'data'),false)
    }
    // An independently authorized native human still sees real persisted grants.
    const reader = await h.addPerson({name:'Explicit authority reader', change: rules => [...rules,
      ...['member','grant'].map(kind => ({id:createUlid(),principals:rules[0].principals,entityId:AUTHORITY_ENTITY_IDS[kind],rows:{kind:'all',conditions:[]},readableFields:[],writableFields:[],actions:[`${kind}.read`],effect:'allow'})),
    ]})
    const grantId=createUlid(), starts=Date.now(), ends=starts+3600000
    const spec={delegate:{kind:'human',id:reader.id},appId:LAUNCH_APP_ID,actions:['launch.campaign.update'],scope:[{entityId:launchEntities.campaign}],allowedTransitions:[],perAction:[],period:{startsAt:new Date(starts).toISOString(),endsAt:new Date(ends).toISOString(),ceiling:[],modelCalls:0,wallSeconds:0},providerScopes:[],startsAt:new Date(starts).toISOString(),expiresAt:new Date(ends).toISOString(),decisionRules:[]}
    await h.db.prepare("INSERT INTO authority_grants(id,issuer_id,delegate_id,app_id,spec_json,impact_hash,state,version,starts_at,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'proposed',1,?,?,?,?)").bind(grantId,h.owner,reader.id,LAUNCH_APP_ID,JSON.stringify(spec),'fixture-proposal',starts,ends,starts,starts).run()
    const beforeAllowedRead = await authorityState()
    const allowedAccess = (await body(await h.request(reader.session,capabilitiesPath))).data
    assert.equal(allowedAccess.allowedActions.find(action => action.action === 'grant.read').enabled,true)
    assert.deepEqual((await body(await h.request(reader.session,grantsPath))).data.items.map(grant => grant.id),[grantId])
    assert.deepEqual(await authorityState(),beforeAllowedRead)
    const grantOnlyRules=reader.rules.filter(rule=>rule.entityId!==AUTHORITY_ENTITY_IDS.member)
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(grantOnlyRules),reader.policyId).run()
    const grantOnlyAccess=(await body(await h.request(reader.session,capabilitiesPath))).data
    assert.equal(grantOnlyAccess.allowedActions.find(action=>action.action==='member.read').enabled,false)
    assert.equal(grantOnlyAccess.allowedActions.find(action=>action.action==='grant.read').enabled,true,'Grant reads do not depend on member-read permission')
    assert.equal((await h.request(reader.session,membersPath)).status,403)
    assert.deepEqual((await body(await h.request(reader.session,grantsPath))).data.items.map(grant=>grant.id),[grantId])
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(grantOnlyRules.map(rule => ({...rule,actions:rule.actions.filter(action => action!=='grant.read')}))),reader.policyId).run()
    assert.equal((await body(await h.request(reader.session,capabilitiesPath))).data.allowedActions.find(action => action.action === 'grant.read').enabled,false,'Capability follows current policy')
    assert.equal((await h.request(reader.session,grantsPath)).status,403,'The grant endpoint independently rechecks a previously permitted reader')
    const csrfResponse=await h.request(reader.session,'/auth/csrf')
    assert.equal(csrfResponse.status,200)
    const {csrfToken}=await csrfResponse.json()
    assert.equal((await h.request(reader.session,`/auth/sessions/${reader.session.baseId}/revoke`,{method:'POST',body:'{}',headers:{'x-csrf-token':csrfToken}})).status,200)
    for (const route of [membersPath,grantsPath,capabilitiesPath]) {
      const response=await h.request(reader.session,route)
      assert.equal(response.status,401,'Revoked native sessions cannot read capabilities or grants')
      assert.equal(Object.hasOwn(await response.json(),'data'),false)
    }
    await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=?").bind(legacyManager.id).run()
    for (const route of [membersPath,grantsPath,capabilitiesPath]) {
      const response=await h.request(legacyManager.session,route)
      assert.equal(response.status,403,'Removed membership cannot read capabilities or grants')
      assert.equal(Object.hasOwn(await response.json(),'data'),false)
    }
    for (const route of routes) assert.equal((await h.request(full.session, route)).status, 200, route)
    const directory = await body(await h.request(h.ownerSession, '/api/v1/launch/owners'))
    assert.ok(directory.data.items.every(person => Object.keys(person).sort().join(',') === 'id,name'),'Owner selection exposes only stable identity and name')
    assert.equal((await h.request(h.ownerSession,`/api/v1/members?appId=${LAUNCH_APP_ID}`)).status,200,'The existing legacy operator management contract permits its app-scoped directory')
    const repair = await h.addPerson({ appId: '00000000000000000000000600' })
    const hidden = await h.addPerson({ change: rules => rules.map(rule => rule.entityId === launchEntities.campaign ? { ...rule, readableFields: rule.readableFields.filter(id => id !== launchFieldIds.campaign.objective), actions: [] } : rule) })
    const limited = await h.addPerson({ change: rules => rules.map(rule => rule.entityId === launchEntities.campaign ? { ...rule, rows: { kind: 'condition', fieldId: launchFieldIds.campaign.code, op: 'eq', value: first.code }, actions: [] } : rule) })
    const linkedHidden = await h.addPerson({ change: rules => rules.map(rule => rule.entityId === launchEntities.risk ? { ...rule, readableFields: rule.readableFields.filter(id => id !== launchFieldIds.risk.signal) } : rule) })
    for (const route of routes) assert.equal((await h.request(linkedHidden.session,route)).status,403,`linked field: ${route}`)
    assert.equal((await h.request(linkedHidden.session,`${campaignsPath}/${first.id}`)).status,200,'Canonical campaign fields remain available independently of linked hidden risk fields')
    const revoked = await h.addPerson()
    await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=?").bind(revoked.id).run()
    for (const person of [repair, hidden, limited, revoked]) {
      assert.equal((await h.request(person.session, '/api/v1/session')).status, 200)
      for (const route of routes) assert.equal((await h.request(person.session, route)).status, 403, `${person.id}: ${route}`)
      for (const route of ['/app', `/app/campaigns/${first.id}`, '/app/lenses/risks', '/app/lenses/timeline', '/app/decisions', '/app/automations']) {
        const response = await h.request(person.session, route), html = await response.text()
        assert.ok(!html.includes(first.name), `SSR must not contain ${first.name}: ${route}`)
        assert.ok(!html.includes(risk.signal), `SSR must not contain risk evidence: ${route}`)
        if (route === '/app') { assert.equal(response.status,200); assert.match(html,/href="\/app\/records"/,'Home keeps record discovery available while the portfolio read is forbidden') }
        else assert.ok(response.status >= 400, `${route}: ${response.status}`)
      }
      const mutation = await h.request(person.session, `/api/campaigns/${first.id}`, { method: 'PATCH', body: JSON.stringify({ version: first.version, name: 'Unauthorized edit' }) })
      assert.equal(mutation.status,403)
      const create = await h.request(person.session,'/api/v1/commands/launch.campaign.create',{ method:'POST',body:JSON.stringify({ commandId:createUlid(),expected:[],input:{fields:{code:'DENIED',name:'Unauthorized',ownerId:h.owner,startDate:'2026-10-01',launchDate:'2026-12-01',objective:'No',statusSummary:'No',phase:'Planning',status:'On track',health:50,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}} }) })
      assert.equal(create.status,403)
      // The command door answers them about an existing record exactly as about a missing
      // one: no stored version and no check that depends on the record's private values.
      const { version } = await h.db.prepare('SELECT version FROM campaigns WHERE id=?').bind(first.id).first()
      const revision = [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: first.id }, version }], answers = []
      for (const [id, expected, changes] of [[createUlid(), [], { name: 'Unauthorized edit' }], [first.id, [], { name: 'Unauthorized edit' }], [first.id, revision, { startDate: '2099-01-01' }], [first.id, revision, { startDate: '2000-01-01' }]]) {
        const response = await h.request(person.session, '/api/v1/commands/launch.campaign.patch', { method: 'POST', body: JSON.stringify({ commandId: createUlid(), expected, input: { id, changes } }) })
        const { error } = await response.json()
        answers.push([response.status, error.code, Object.hasOwn(error, 'currentVersion')])
      }
      assert.deepEqual(answers, Array(4).fill([404, 'not_found', false]), person.id)
    }
    // Global search now searches each authorized table independently; it no longer
    // requires the full legacy launch projection. Check readable rows, not that gate.
    const searchCampaigns=async session=>(await body(await h.request(session,`/api/search?q=${encodeURIComponent(first.code)}`))).items.filter(hit=>hit.appId===LAUNCH_APP_ID&&hit.entityId===launchEntities.campaign)
    for(const person of [full,hidden,limited,linkedHidden])assert.deepEqual((await searchCampaigns(person.session)).map(hit=>hit.id),[first.id],'Global search retains the readable campaign under narrower rows or fields')
    for(const person of [repair,revoked])assert.deepEqual(await searchCampaigns(person.session),[],'Global search exposes no campaign outside current membership')
    assert.equal((await h.request(repair.session,`${campaignsPath}/${first.id}`)).status,403)
    const masked = await body(await h.request(hidden.session,`${campaignsPath}/${first.id}`))
    assert.equal(masked.data.record.fields[launchFieldIds.campaign.objective].state,'redacted')
    const scoped = await body(await h.request(limited.session,campaignsPath.replace('/records','/query'),{method:'POST',body:JSON.stringify({limit:50})}))
    assert.deepEqual(scoped.data.items.map(row=>row.id),[first.id])
    assert.equal((await h.request(limited.session,`${campaignsPath}/${campaigns.items[1].id}`)).status,404)
    assert.deepEqual(await body(await h.request(h.ownerSession,'/api/campaigns')),campaigns)
    // A policy edit, without membership removal or logout, revokes the projection.
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(full.rules.map(rule=>({...rule,effect:'deny'}))),full.policyId).run()
    assert.equal((await h.request(full.session,'/api/campaigns')).status,403)
  } finally { await h.close() }
})

test('[OPS-001 APP-SCOPE-001] reviewed legacy mapping retains identities and rights without replacing an existing scoped policy', async () => {
  const h = await launchAuthorityRuntime()
  try {
    const scoped=await h.addPerson({change:rules=>rules.map(rule=>({...rule,actions:[],writableFields:[]}))})
    const otherApp=await h.addPerson({appId:'00000000000000000000000600'})
    const authority=async()=>Object.fromEntries(await Promise.all(['authority_policies','authority_memberships','authority_grants'].map(async table=>[table,(await h.db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()).results])))
    const original=await authority(),peers=[],now=new Date().toISOString()
    for(const name of ['Prior launch operator','Second launch operator']){
      const id=createUlid(),policyId=createUlid()
      await h.db.prepare('INSERT INTO operators(id,created_at,updated_at,version,name,email,active) VALUES(?,1,1,1,?,?,1)').bind(id,name,`${id}@example.test`).run()
      const rules=JSON.parse(h.policy.rules_json).map(rule=>({...rule,id:createUlid(),principals:[{kind:'human',id}],rows:rule.rows.kind==='condition'&&rule.rows.value===h.owner?{...rule.rows,value:id}:rule.rows}))
      const policy={id:policyId,appId:LAUNCH_APP_ID,name:'Reviewed original launch mapping',rules,version:1,createdAt:now,updatedAt:now}
      peers.push({id,policyId,policy})
    }
    // Include an already-scoped person in the historical input: its current
    // policy and membership must win over the reviewed legacy mapping.
    const retainedPolicy={...peers[0].policy,id:createUlid(),rules:peers[0].policy.rules.map(rule=>({...rule,id:createUlid(),principals:[{kind:'human',id:scoped.id}],rows:rule.rows.kind==='condition'&&rule.rows.value===peers[0].id?{...rule.rows,value:scoped.id}:rule.rows}))}
    const input={initialOwnerId:h.owner,launchAppId:LAUNCH_APP_ID,policies:[...peers.map(peer=>peer.policy),retainedPolicy],memberships:[...peers.map(({id,policyId})=>({memberId:id,policyId})),{memberId:scoped.id,policyId:retainedPolicy.id}]}
    await initializeLegacyAuthority(h.db,input)
    const before=await authority()
    for(const [table,rows] of Object.entries(original))for(const row of rows)assert.ok(before[table].some(current=>JSON.stringify(current)===JSON.stringify(row)),'Existing scoped authority is preserved exactly')
    for(const peer of peers){
      const membership=before.authority_memberships.find(row=>row.principal_id===peer.id)
      assert.equal(membership.policy_id,peer.policyId);assert.equal(membership.legacy,1)
    }
    await initializeLegacyAuthority(h.db,input)
    await h.db.batch(await prepareLaunchSetup(h.db,h.owner))
    assert.deepEqual(await authority(),before)
    await adoptFixtureOperators(h.db)
    for(const peer of peers){
      peer.session=await h.signIn(peer.id)
      assert.notEqual(peer.id,h.owner)
      assert.equal((await h.db.prepare('SELECT role FROM oa_operators WHERE id=?').bind(peer.id).first()).role,'member')
      assert.equal((await body(await h.request(peer.session,'/api/session'))).operator.id,peer.id)
      assert.equal((await h.request(peer.session,'/api/campaigns')).status,200)
      const denied=await h.request(peer.session,'/api/v1/apps/00000000000000000000000600/entities/00000000000000000000000610/query',{method:'POST',body:'{}'})
      assert.equal(denied.status,403,'Retained Launch rights do not expose another application')
      assert.equal(Object.hasOwn(await denied.json(),'data'),false)
    }
    const revisions=(kind,row)=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],recordId:row.id},version:row.version}]
    const committed=[]
    const command=async(peer,action,input,expected=[])=>{
      const route=`/api/v1/commands/launch.${action}`,envelope=JSON.stringify({commandId:createUlid(),input,expected})
      const data=(await body(await h.request(peer.session,route,{method:'POST',body:envelope}))).data
      assert.equal(data.state,'committed');committed.push({peer,route,envelope});return data.value
    }
    const readCampaign=async(peer,id)=>(await body(await h.request(peer.session,`/api/campaigns/${id}`))).campaign
    for(const [index,actor] of peers.entries()){
      const owner=peers[1-index]
      const fields={code:`LEGACY-${index}`,name:`Shared campaign ${index}`,ownerId:owner.id,startDate:'2026-01-01',launchDate:'2027-01-01',objective:'Original objective',statusSummary:'Shared work',phase:'Planning',status:'On track',health:50,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}
      const campaign=await command(actor,'campaign.create',{fields})
      for(const reader of peers){
        const current=await readCampaign(reader,campaign.id)
        assert.equal(current.name,`Shared campaign ${index}`);assert.equal(current.owner.id,owner.id)
        assert.equal(current.objective,'Original objective');assert.equal(current.version,1)
      }
      // Optimistic versions come from a fresh public read, never fixture SQL.
      await command(actor,'campaign.patch',{id:campaign.id,changes:{name:`Edited campaign ${index}`,objective:'Edited by the other operator'}},revisions('campaign',await readCampaign(actor,campaign.id)))
      for(const reader of peers){
        const current=await readCampaign(reader,campaign.id)
        assert.equal(current.name,`Edited campaign ${index}`);assert.equal(current.owner.id,owner.id)
        assert.equal(current.objective,'Edited by the other operator');assert.equal(current.version,2)
      }
      const deliverable=await command(actor,'deliverable.create',{fields:{campaignId:campaign.id,title:`Shared deliverable ${index}`,ownerId:owner.id,dueDate:null}})
      const readDeliverable=async reader=>{
        const detail=await body(await h.request(reader.session,`/api/campaigns/${campaign.id}`))
        const row=detail.deliverables.find(row=>row.id===deliverable.id)
        assert.ok(row);assert.equal(row.title,`Shared deliverable ${index}`);assert.equal(row.owner.id,owner.id)
        assert.equal(detail.campaign.deliverableTotal,1)
        assert.equal(detail.campaign.deliverableComplete,row.state==='Complete'?1:0)
        return row
      }
      for(const [action,state,version] of [[null,'Open',1],['complete','Complete',2],['reopen','Open',3]]){
        if(action)await command(actor,`deliverable.${action}`,{id:deliverable.id},revisions('deliverable',await readDeliverable(actor)))
        for(const reader of peers){
          const current=await readDeliverable(reader)
          assert.equal(current.state,state);assert.equal(current.version,version)
          assert.equal(current.completedById,state==='Complete'?actor.id:null)
          if(state==='Complete')assert.ok(current.completedAt);else assert.equal(current.completedAt,null)
        }
      }
      assert.equal((await h.request(otherApp.session,`/api/campaigns/${campaign.id}`)).status,403)
      const denied=await h.request(scoped.session,'/api/v1/commands/launch.campaign.patch',{method:'POST',body:JSON.stringify({commandId:createUlid(),input:{id:campaign.id,changes:{name:'Forbidden scoped edit'}},expected:revisions('campaign',await readCampaign(scoped,campaign.id))})})
      assert.equal(denied.status,404,'A reviewed legacy mapping does not widen an existing scoped membership')
      const refusal=await denied.json()
      assert.equal(refusal.error.code,'not_found');assert.equal(Object.hasOwn(refusal.error,'currentVersion'),false)
      for(const reader of peers)assert.equal((await readCampaign(reader,campaign.id)).name,`Edited campaign ${index}`)
    }
    assert.deepEqual(await authority(),before,'Native mutations create no grants and alter no policies or memberships')
    const id=peers[0].id
    await h.db.prepare('DELETE FROM authority_memberships WHERE principal_id=?').bind(id).run()
    await initializeLegacyAuthority(h.db,input)
    assert.equal(await h.db.prepare('SELECT 1 FROM authority_memberships WHERE principal_id=?').bind(id).first(),null,'Repeating an exact historical mapping cannot restore a deleted membership')
    assert.equal((await h.request(peers[0].session,'/api/campaigns')).status,403)
    const captured=committed[0]
    const campaignState=async()=>(await body(await h.request(peers[1].session,'/api/campaigns'))).items.map(({id,name,version,owner})=>({id,name,version,owner}))
    const prior=await campaignState(),replay=await h.request(captured.peer.session,captured.route,{method:'POST',body:captured.envelope})
    assert.equal(replay.status,404,'Deleted membership fences a captured committed command as well as new reads')
    const refusal=await replay.json()
    assert.equal(refusal.error.code,'not_found');assert.equal(Object.hasOwn(refusal,'data'),false)
    assert.deepEqual(await campaignState(),prior,'Refused replay does not create or change campaign work')
    assert.equal((await h.db.prepare('SELECT count(*) n FROM authority_grants').first()).n,0)
  } finally { await h.close() }
})
