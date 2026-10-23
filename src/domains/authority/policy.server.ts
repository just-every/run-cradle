import {personalStorePermit} from './personal-stores.server'
import {liveRecord} from '../records/trash/authority.server'
import {ownerSheetsRead} from './sheets-read.server'
import { ownerConnectionControl } from './connection-management'
import { and, or, trustedPredicate, identifier } from '../admission/sql.server'
import type { SqlPredicate } from '../admission/ports'
import type { GrantSpec, Policy } from './contracts'
import type { AuthorityPermit, AuthorizationRequest, PolicyPort, PolicyScope, RequestContext, DecisionAuthorityPort } from './ports'
import { principalGuards } from './guards.server'
import { compileFilter, type EntityRegistry } from './scope.server'
import { grantSpecSchema, policyRuleSchema, moneySchema } from './validators'
import { AuthorityError, denied } from './errors'
import { digest } from './crypto.server'
import { canonicalJson } from './grants.server'
import { revalidateReservations } from './reservation-binding.server'
import { proposedRowPredicate } from './proposed-row.server'
import { canonicalInteger, reserveBudgets } from './budget.server'
import { providerGrantIssuerGuards } from './provider-grant.server'
/** Shared membership fence; capacity planning may measure this exact template. */
export const membershipPolicyGuard=(ctx:RequestContext,appId:string,row:{id:string;version:number;membership_version:number})=>trustedPredicate(`EXISTS(SELECT 1 FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.principal_id=? AND m.app_id=? AND m.state='active' AND m.version=? AND p.id=? AND p.version=?)`,[ctx.principal.id,appId,row.membership_version,row.id,row.version])
/** Contexts of read-only (GET/HEAD) requests: nothing in them changes authority, so their
 * policy reads may be shared. Background work and tests hold contexts across changes. */
const readOnlyContexts=new WeakSet<RequestContext>()
export const readOnlyContext=<T extends RequestContext>(ctx:T)=>{readOnlyContexts.add(ctx);return ctx}
export const createPolicyPort=(db:D1Database,registry:EntityRegistry,decisions?:DecisionAuthorityPort):PolicyPort=>{
  const load=async(ctx:RequestContext,appId:string)=>{
    const row=await db.prepare(`SELECT p.id,p.version,p.rules_json,m.version AS membership_version FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.principal_id=? AND m.app_id=? AND m.state='active' AND p.app_id=m.app_id`).bind(ctx.principal.id,appId).first<{id:string;version:number;rules_json:string;membership_version:number}>()
    if(!row)return denied()
    const rules=policyRuleSchema.array().parse(JSON.parse(row.rules_json)) as Policy['rules']
    const guards=[...principalGuards(ctx),membershipPolicyGuard(ctx,appId,row)]
    const actual=await db.prepare(`SELECT 1 AS ok WHERE ${and(...guards).sql}`).bind(...and(...guards).values).first()
    if(!actual)return denied()
    if(ctx.principal.credentialId){
      const credential=await db.prepare(`SELECT scopes_json FROM authority_credentials WHERE id=? AND revoked_at IS NULL AND expires_at>?`).bind(ctx.principal.credentialId,Date.parse(ctx.now)).first<{scopes_json:string}>()
      if(!credential)return denied()
      const scopes=JSON.parse(credential.scopes_json) as {appId:string;actions:string[];purposes:string[]}[]
      if(!scopes.some(s=>s.appId===appId))return denied()
    }
    return {rules:rules.filter(r=>r.principals.some(p=>p.id===ctx.principal.id&&p.kind===ctx.principal.kind)),guards,version:row.version}
  }
  // A read-only request context reads its policy once per app for scoping; every scoped
  // read still executes the returned guards, denials and authorize always load afresh.
  const loadedForReads=new WeakMap<RequestContext,Map<string,ReturnType<typeof load>>>()
  const loadForRead=(ctx:RequestContext,appId:string)=>{
    if(!readOnlyContexts.has(ctx))return load(ctx,appId)
    let loaded=loadedForReads.get(ctx)
    if(!loaded)loadedForReads.set(ctx,loaded=new Map())
    let pending=loaded.get(appId)
    if(!pending){pending=load(ctx,appId);loaded.set(appId,pending);pending.catch(()=>loaded.delete(appId))}
    return pending
  }
  const proposerPermit=async(ctx:RequestContext,request:AuthorizationRequest):Promise<AuthorityPermit>=>{
    if(ctx.principal.proposer?.appId!==request.appId||!['schema.propose','schema.withdraw'].includes(request.action)||request.cost.length||request.grantId||request.connectionId)return denied()
    const credential=await db.prepare('SELECT scopes_json FROM authority_credentials WHERE id=? AND principal_id=?').bind(ctx.principal.credentialId,ctx.principal.id).first<{scopes_json:string}>()
    if(!credential||!(JSON.parse(credential.scopes_json) as {appId:string;actions:string[]}[]).some(s=>s.appId===request.appId&&s.actions.includes('schema.propose')))return denied()
    const guards=principalGuards(ctx),check=and(...guards)
    if(!await db.prepare(`SELECT 1 WHERE ${check.sql}`).bind(...check.values).first())return denied()
    return {actor:{id:ctx.principal.id,kind:ctx.principal.kind},action:request.action,appId:request.appId,grantId:null,grantVersion:null,policyVersion:0,validUntil:ctx.principal.expiresAt,guards,reservationMutations:[],reservationIds:[]}
  }
  const scope:PolicyPort['scope']=async(ctx,request)=>{
    const loaded=await loadForRead(ctx,request.appId),entity=registry.get(request.appId,request.entityId)
    if(!entity)return denied()
    if(ctx.principal.credentialId){const c=await db.prepare('SELECT scopes_json FROM authority_credentials WHERE id=?').bind(ctx.principal.credentialId).first<{scopes_json:string}>();const credentialScopes=JSON.parse(c!.scopes_json) as {appId:string;purposes:string[]}[];if(!credentialScopes.some(s=>s.appId===request.appId&&s.purposes.includes(request.purpose)))return denied()}
    const rules=loaded.rules.filter(r=>r.entityId===request.entityId&&(r.purposes??['read']).includes(request.purpose))
    const allow=rules.filter(r=>r.effect==='allow'),deny=rules.filter(r=>r.effect==='deny')
    if(!allow.length)return denied()
    const common=(key:'readableFields'|'writableFields')=>allow[0]![key].filter(id=>allow.every(r=>r[key].includes(id))&&!deny.some(r=>r[key].includes(id)))
    const deniedRows=or(...deny.map(r=>compileFilter(r.rows,entity,ctx.now)))
    const selection=and(...(entity.appColumn?[trustedPredicate(`${identifier(entity.table)}.${identifier(entity.appColumn)}=?`,[request.appId])]:[]),or(...allow.map(r=>compileFilter(r.rows,entity,ctx.now))),trustedPredicate(`NOT (${deniedRows.sql})`,deniedRows.values))
    const visibility=liveRecord(ctx,request.appId,request.entityId,entity.table,entity.idColumn)
    const rowPredicate=and(selection,visibility,...loaded.guards)
    // Cursor identity retains the membership/policy fence, but excludes per-request clock parameters.
    // Every read still executes rowPredicate and all currentAuthorityGuards.
    const cursorPredicate=and(selection,visibility,loaded.guards[loaded.guards.length-1]!)
    const result:PolicyScope={principal:ctx.principal,appId:request.appId,entityId:request.entityId,policyVersion:loaded.version,rowPredicate,cursorPredicate,readableFieldIds:common('readableFields'),writableFieldIds:common('writableFields'),discoverableRelations:entity.fields.filter(f=>(f.type==='relation'||f.relationDiscoverable===true)&&common('readableFields').includes(f.id)).map(f=>f.id),validUntil:ctx.principal.expiresAt,currentAuthorityGuards:loaded.guards}
    // Composite legacy projections contain linked values and derived counts. They
    // may only bypass per-row projection when this policy proves unbounded read.
    result.unrestrictedRows=allow.some(r=>r.rows.kind==='all'&&r.rows.conditions.length===0)&&deny.length===0
    return result
  }
  const authorize:PolicyPort['authorize']=async(ctx,request)=>{
    // The binding was read from durable server-owned delegation state, never a request role.
    if(ctx.principal.delegationGrant&&!request.grantId)
      request={...request,grantId:ctx.principal.delegationGrant.id,grantVersion:ctx.principal.delegationGrant.version}
    // An issuer view only reads; a proposing key may only propose or withdraw for its own base.
    if(ctx.principal.viaProposer)return denied()
    if(ctx.principal.proposer)return proposerPermit(ctx,request)
    request.cost.forEach(cost=>moneySchema.parse(cost))
    const audMicros=request.cost.filter(c=>c.currency==='AUD').reduce((sum,c)=>sum+canonicalInteger(c.minor)*10n**BigInt(6-c.scale),0n)
    const personal=await personalStorePermit(db,{scope,authorize},registry,ctx,request);if(personal)return personal
    const loaded=await load(ctx,request.appId),guards:SqlPredicate[]=[...loaded.guards]
    if(ownerConnectionControl(request.action)){
      if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||ctx.principal.credentialId)return denied('A current installation owner session is required to manage connections.')
      guards.push(trustedPredicate("EXISTS(SELECT 1 FROM authority_principals WHERE id=? AND initial_owner=1 AND state='active')",[ctx.principal.id]))
    }
    if(ctx.principal.kind!=='human'&&/^(grant\.|policy\.|member\.|credential\.)/.test(request.action))return denied('Only an authorized human can manage authority.')
    if(ctx.principal.credentialId){const c=await db.prepare('SELECT scopes_json FROM authority_credentials WHERE id=?').bind(ctx.principal.credentialId).first<{scopes_json:string}>();const scopes=JSON.parse(c!.scopes_json) as {appId:string;actions:string[];purposes:string[]}[];if(!scopes.some(s=>s.appId===request.appId&&s.actions.includes(request.action)&&(!request.purpose||s.purposes.includes(request.purpose))))return denied()}
    const sheetsRead=await ownerSheetsRead(db,ctx,request);if(sheetsRead)guards.push(sheetsRead)
    const readOnly=!!sheetsRead||['execution.read','execution.reconcile','model.read','connection.read','connection.reconcile'].includes(request.action)&&request.cost.length===0;
    const metadataOrControl=readOnly||['run.cancel','attempt.reconcile','attempt.recover','connection.configure','connection.begin-consent','connection.revoke','connection.check'].includes(request.action)&&request.cost.length===0;
    if(request.proposedRows?.some(p=>p.entityId!==request.targetEntityId)||request.expected.some(e=>e.ref.appId!==request.appId))return denied()
    const entities=request.targetEntityId?[request.targetEntityId]:request.expected.length?[...new Set(request.expected.map(r=>r.ref.entityId))]:[...new Set(loaded.rules.filter(r=>r.actions.includes(request.action)).map(r=>r.entityId))]
    if(!entities.length)return denied()
    const knownFields=new Set(entities.flatMap(id=>registry.get(request.appId,id)?.fields.map(f=>f.id)??[]))
    if(request.fieldIds?.some(id=>!knownFields.has(id)))return denied()
    for(const entityId of entities){
      const entity=registry.get(request.appId,entityId);if(!entity)return denied()
      const entityFieldIds=request.fieldIds?.filter(id=>entity.fields.some(f=>f.id===id))
      const applicable=loaded.rules.filter(r=>r.entityId===entityId&&r.actions.includes(request.action))
      const allowed=applicable.filter(r=>r.effect==='allow'&&(!entityFieldIds||entityFieldIds.every(f=>(readOnly?r.readableFields:r.writableFields).includes(f))))
      if(!allowed.length)return denied()
      const deniedRows=or(...applicable.filter(r=>r.effect==='deny').map(r=>compileFilter(r.rows,entity,ctx.now)))
      const rows=and(liveRecord(ctx,request.appId,entityId,entity.table,entity.idColumn),...(entity.appColumn?[trustedPredicate(`${identifier(entity.table)}.${identifier(entity.appColumn)}=?`,[request.appId])]:[]),or(...allowed.map(r=>compileFilter(r.rows,entity,ctx.now))),trustedPredicate(`NOT (${deniedRows.sql})`,deniedRows.values))
      const expected=request.expected.filter(r=>r.ref.entityId===entityId), proposed=request.proposedRows?.filter(r=>r.entityId===entityId)??[]
      for(const target of proposed)guards.push(proposedRowPredicate(entity,target.row,rows))
      for(const target of expected){if(target.ref.appId!==request.appId)return denied();guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(entity.table)} WHERE ${identifier(entity.idColumn)}=? AND (${rows.sql}))`,[target.ref.recordId,...rows.values]))}
      // Unbound create/admin permission must be unconditional, never inferred from some visible row.
      if(!expected.length&&!proposed.length&&(!allowed.some(r=>r.rows.kind==='all'&&r.rows.conditions.length===0)||applicable.some(r=>r.effect==='deny')))return denied()
    }
    let grantId:string|null=null,grantVersion:number|null=null,validUntil=ctx.principal.expiresAt,requiresDecision=false
    let reservationMutations:Awaited<ReturnType<typeof reserveBudgets>>['mutations']=[],reservationIds:string[]=[]
    if((ctx.principal.kind!=='human'&&!(readOnly||request.action==='run.cancel'&&request.cost.length===0))||request.grantId||(request.connectionId&&!metadataOrControl)){
      if(!request.grantId||!request.grantVersion||!request.commandId)return denied('A persisted current grant and command identity are required.')
      const row=await db.prepare(`SELECT * FROM authority_grants WHERE id=? AND delegate_id=? AND app_id=?`).bind(request.grantId,ctx.principal.id,request.appId).first<{id:string;version:number;state:string;spec_json:string;issuer_id:string;starts_at:number;expires_at:number}>()
      if(!row||row.state!=='active'||row.version!==request.grantVersion)throw new AuthorityError('grant_revoked','The grant is not current.')
      const spec=grantSpecSchema.parse(JSON.parse(row.spec_json)) as GrantSpec
      const now=Date.parse(ctx.now)
      if(now<row.starts_at||now>=row.expires_at||now<Date.parse(spec.period.startsAt)||now>=Date.parse(spec.period.endsAt))throw new AuthorityError('grant_expired','The grant is outside its authorized period.')
      if(!request.expected.length&&!request.targetEntityId)return denied('Delegated actions require an explicit scoped subject or target entity.')
      if(request.targetEntityId){const scope=spec.scope.find(s=>s.entityId===request.targetEntityId);if(!scope)return denied();const proposed=request.proposedRows??[];if(!proposed.length&&(scope.recordIds||scope.filter))return denied('Grant does not cover unbound creation.');for(const target of proposed){const entity=registry.get(request.appId,target.entityId)!;if(scope.recordIds&&!scope.recordIds.includes(String(target.row[entity.idColumn])))return denied();if(scope.filter)guards.push(proposedRowPredicate(entity,target.row,compileFilter(scope.filter,entity,ctx.now)));}}
      if((request.quantity??0)>(spec.perActionQuantity??0))return denied('The per-action quantity ceiling is exceeded.')
      requiresDecision=spec.decisionRules.length>0
      if(!spec.actions.includes(request.action)||(request.transition&&!spec.allowedTransitions.includes(request.transition)))return denied()
      for(const target of request.expected){const s=spec.scope.find(s=>s.entityId===target.ref.entityId);if(!s||s.recordIds&&!s.recordIds.includes(target.ref.recordId))return denied();if(s.filter){const entity=registry.get(request.appId,target.ref.entityId)!;const predicate=compileFilter(s.filter,entity,ctx.now);guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(entity.table)} WHERE ${identifier(entity.idColumn)}=? AND (${predicate.sql}))`,[target.ref.recordId,...predicate.values]))}}
      if(request.connectionId&&!spec.providerScopes.some(s=>s.connectionId===request.connectionId&&!!request.purpose&&s.purposes.includes(request.purpose)&&(request.fieldIds??[]).every(f=>s.fields.includes(f))))return denied()
      if(request.connectionId)guards.push(...await providerGrantIssuerGuards(db,registry,ctx,request,row.issuer_id,spec))
      const amounts=new Map<string,string>()
      for(const cost of request.cost){const cap=spec.perAction.find(v=>v.currency===cost.currency&&v.scale===cost.scale);if(!cap||canonicalInteger(cost.minor)>canonicalInteger(cap.minor))return denied('The per-action monetary ceiling is exceeded.');const unit=`money:${cost.currency}:${cost.scale}`;const total=BigInt(amounts.get(unit)??'0')+canonicalInteger(cost.minor);if(total>canonicalInteger(cap.minor))return denied('The combined per-action ceiling is exceeded.');amounts.set(unit,total.toString())}
      for(const [unit,value]of [['modelCalls',request.modelCalls??0],['wallSeconds',request.wallSeconds??0],['quantity',request.quantity??0]] as const){if(!Number.isSafeInteger(value)||value<0)return denied();if(value)amounts.set(unit,String(value))}
      guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM authority_grants g JOIN authority_principals p ON p.id=g.issuer_id JOIN authority_principals d ON d.id=g.delegate_id WHERE g.id=? AND g.delegate_id=? AND g.version=? AND g.state='active' AND g.restore_hold=0 AND g.revoked_at IS NULL AND g.starts_at<=? AND g.expires_at>MAX(?,unixepoch('subsec')*1000) AND p.state='active' AND d.state='active' AND p.authentication_epoch=g.issuer_epoch AND d.authentication_epoch=g.delegate_epoch)`,[row.id,ctx.principal.id,row.version,now,now]))
      const binding={appId:request.appId,action:request.action,principalId:ctx.principal.id,attemptId:request.existingReservation?.attemptId??request.attemptId??request.commandId,inputHash:request.inputHash,hash:await digest(canonicalJson({appId:request.appId,action:request.action,principalId:ctx.principal.id,grantId:row.id,grantVersion:row.version,expected:request.expected,proposedRows:request.proposedRows??[],targetEntityId:request.targetEntityId??null,inputHash:request.inputHash,cost:request.cost,connectionId:request.connectionId??null,purpose:request.purpose??null,fieldIds:request.fieldIds??[],transition:request.transition??null,modelCalls:request.modelCalls??0,wallSeconds:request.wallSeconds??0,quantity:request.quantity??0}))}
      const budget=request.existingReservation?await revalidateReservations(db,{grantId:row.id,grantVersion:row.version,commandId:request.existingReservation.originCommandId,ids:request.existingReservation.reservationIds,amounts,binding}):await reserveBudgets(db,{grantId:row.id,grantVersion:row.version,commandId:request.commandId,now,amounts,binding});guards.push(...budget.guards);reservationMutations=budget.mutations;reservationIds=budget.ids;grantId=row.id;grantVersion=row.version;validUntil=new Date(Math.min(Date.parse(validUntil),row.expires_at,Date.parse(spec.period.endsAt))).toISOString()
    }
    if(requiresDecision||audMicros>2000000000n){if(!decisions)return denied('A designated human must approve the exact current commitment.');const decision=await decisions.confirm(ctx,{...request,grantId});if(!decision.guards.length)return denied('Decision must supply current atomic guards.');guards.push(...decision.guards)}
    const checks=await db.batch(guards.map(guard=>db.prepare(`SELECT 1 AS permitted WHERE ${guard.sql}`).bind(...guard.values)));if(checks.some(result=>!result.results.length))return denied()
    return {actor:{id:ctx.principal.id,kind:ctx.principal.kind},action:request.action,appId:request.appId,grantId,grantVersion,policyVersion:loaded.version,validUntil,guards,reservationMutations,reservationIds}
  }
  return {scope,authorize}
}
