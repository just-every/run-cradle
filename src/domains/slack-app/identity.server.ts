import type {RequestContext} from '../authority/ports'
import type {SqlPredicate} from '../admission/ports'
import {principalGuards} from '../authority/guards.server'
import {and,trustedPredicate} from '../admission/sql.server'
import {AuthorityError} from '../authority/errors'
import {randomSecret} from '../authority/crypto.server'
import {sha256} from '../../adapters/crypto.server'
import {createUlid} from '../../core/shared/ids'
import type {slackSettings} from './settings.server'
type Link={principal_id:string;authentication_epoch:number;base_operator_id:string;base_operator_version:number;human_id:string}
export function slackIdentity(db:D1Database,settings:ReturnType<typeof slackSettings>){
 const linkGuard=(team:string,user:string)=>trustedPredicate(`EXISTS(SELECT 1 FROM slack_app_links l JOIN authority_principals p ON p.id=l.principal_id JOIN cradle_base_operators m ON m.principal_id=p.id AND m.base_id=l.base_operator_id JOIN oa_operators o ON o.id=m.base_id WHERE l.team_id=? AND l.slack_user_id=? AND p.kind='human' AND p.state='active' AND p.authentication_epoch=l.authentication_epoch AND o.status='active' AND o.version=l.base_operator_version)`,[team,user])
 async function native(ctx:RequestContext){
  if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||!ctx.principal.baseSessionId)throw new AuthorityError('forbidden','Link Slack from your own signed-in Cradle account.')
  const guard=and(...principalGuards(ctx)),row=await db.prepare(`SELECT o.id,o.version FROM cradle_base_operators m JOIN oa_operators o ON o.id=m.base_id WHERE m.principal_id=? AND o.status='active' AND (${guard.sql})`).bind(ctx.principal.id,...guard.values).first<{id:string;version:number}>()
  if(!row)throw new AuthorityError('forbidden','A current native Cradle account is required.')
  return {row,guard}
 }
 return {linkGuard,async code(ctx:RequestContext){
  const {row,guard}=await native(ctx),{installation,guard:installed}=await settings.resolve(true),current=and(guard,installed)
  const code=randomSecret(),expiresAt=Date.now()+600000,nonce=createUlid()
  await db.batch([
   db.prepare(`INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,0,CASE WHEN (${current.sql}) THEN 1 ELSE 0 END`).bind(nonce,...current.values),
   db.prepare('DELETE FROM slack_app_link_codes WHERE principal_id=? AND installation_instance=? AND consumed_at IS NULL').bind(ctx.principal.id,installation.instance_id),
   db.prepare('INSERT INTO slack_app_link_codes(code_hash,principal_id,authentication_epoch,base_operator_id,base_operator_version,expires_at,installation_instance) VALUES(?,?,?,?,?,?,?)').bind(await sha256(code),ctx.principal.id,ctx.principal.authenticationEpoch,row.id,row.version,expiresAt,installation.instance_id),
   db.prepare('DELETE FROM admission_assertions WHERE nonce=?').bind(nonce),
  ])
  return {code,expiresAt:new Date(expiresAt).toISOString(),instruction:'/cradle-link '+code}
 },async unlink(ctx:RequestContext){
  const {guard}=await native(ctx),{installation}=await settings.resolve(true),nonce=createUlid()
  // Unlink revokes pending link authority as well as the current association.
  // A previously copied code cannot silently undo this explicit revocation.
  await db.batch([
   db.prepare(`INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,0,CASE WHEN (${guard.sql}) THEN 1 ELSE 0 END`).bind(nonce,...guard.values),
   db.prepare('DELETE FROM slack_app_link_codes WHERE principal_id=? AND installation_instance=?').bind(ctx.principal.id,installation.instance_id),
   db.prepare('DELETE FROM slack_app_links WHERE principal_id=? AND team_id=?').bind(ctx.principal.id,installation.team_id),
   db.prepare('DELETE FROM admission_assertions WHERE nonce=?').bind(nonce),
  ])
  return {linked:false}
 },
 async consume(team:string,user:string,code:string){
  const {installation,guard:installed}=await settings.resolve(true)
  if(installation.team_id!==team)throw new AuthorityError('forbidden','This Slack workspace is not installed.')
  const hash=await sha256(code),row=await db.prepare('SELECT * FROM slack_app_link_codes WHERE code_hash=? AND installation_instance=? AND consumed_at IS NULL AND expires_at>?').bind(hash,installation.instance_id,Date.now()).first<{principal_id:string;authentication_epoch:number;base_operator_id:string;base_operator_version:number}>()
  if(!row)throw new AuthorityError('version_conflict','This link code is expired or already used.',409)
  const existing=await db.prepare('SELECT principal_id FROM slack_app_links WHERE team_id=? AND slack_user_id=?').bind(team,user).first<{principal_id:string}>()
  if(existing&&existing.principal_id!==row.principal_id)throw new AuthorityError('version_conflict','Unlink this Slack account from its current Cradle account first.',409)
  const now=Date.now(),nonce=createUlid(),valid=and(installed,trustedPredicate(`EXISTS(SELECT 1 FROM slack_app_link_codes c JOIN authority_principals p ON p.id=c.principal_id JOIN cradle_base_operators m ON m.principal_id=p.id AND m.base_id=c.base_operator_id JOIN oa_operators o ON o.id=m.base_id WHERE c.code_hash=? AND c.installation_instance=? AND c.consumed_at IS NULL AND c.expires_at>? AND p.kind='human' AND p.state='active' AND p.authentication_epoch=c.authentication_epoch AND o.status='active' AND o.version=c.base_operator_version)`,[hash,installation.instance_id,now]))
  await db.batch([
   db.prepare(`INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,0,CASE WHEN (${valid.sql}) THEN 1 ELSE 0 END`).bind(nonce,...valid.values),
   db.prepare('DELETE FROM slack_app_links WHERE team_id=? AND principal_id=?').bind(team,row.principal_id),
   db.prepare('INSERT INTO slack_app_links(team_id,slack_user_id,principal_id,authentication_epoch,base_operator_id,base_operator_version,created_at) VALUES(?,?,?,?,?,?,?)').bind(team,user,row.principal_id,row.authentication_epoch,row.base_operator_id,row.base_operator_version,now),
   db.prepare('UPDATE slack_app_link_codes SET consumed_at=? WHERE code_hash=?').bind(now,hash),db.prepare('DELETE FROM admission_assertions WHERE nonce=?').bind(nonce),
  ])
  return {linked:true}
 },async withPerson<T>(team:string,user:string,appId:string,run:(ctx:RequestContext,guard:SqlPredicate)=>Promise<T>):Promise<T>{
  const guard=linkGuard(team,user),person=await db.prepare(`SELECT l.*,p.human_id FROM slack_app_links l JOIN authority_principals p ON p.id=l.principal_id WHERE l.team_id=? AND l.slack_user_id=? AND (${guard.sql})`).bind(team,user,...guard.values).first<Link>()
  if(!person)throw new AuthorityError('forbidden','Link your current Cradle account in Settings before using this Slack action.')
  const id=createUlid(),now=new Date(),expiresAt=new Date(now.getTime()+60000).toISOString()
  const created=await db.prepare(`INSERT INTO authority_credentials(id,principal_id,token_hash,audience,scopes_json,created_at,expires_at,authentication_epoch) SELECT ?,?,?,?,?,?,?,? WHERE ${guard.sql}`).bind(id,person.principal_id,await sha256(randomSecret()),'slack-person-internal',JSON.stringify([{appId,actions:['record.read','record.patch'],purposes:['read','export']}]),now.getTime(),Date.parse(expiresAt),person.authentication_epoch,...guard.values).run()
  if(!created.meta.changes)throw new AuthorityError('forbidden','The linked account changed before this Slack action.')
  const ctx:RequestContext={requestId:createUlid(),now:now.toISOString(),ingress:'webhook',principal:{id:person.principal_id,kind:'human',humanId:person.human_id,sessionId:null,credentialId:id,issuedAt:now.toISOString(),expiresAt,authenticationEpoch:person.authentication_epoch}}
  try{return await run(ctx,guard)}finally{await db.prepare('DELETE FROM authority_credentials WHERE id=?').bind(id).run()}
 }}
}
