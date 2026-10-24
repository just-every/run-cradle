import {z} from 'zod'
import type {PlatformBindings} from '../../core/platform/bindings'
import type {RequestContext} from '../authority/ports'
import {environmentKeyring,seal,open,type Sealed} from '../connections/crypto.server'
import {ownerDelegationSnapshot} from '../authority/delegation.server'
import {LAUNCH_APP_ID} from '../../apps/launch/contracts'
import {AuthorityError} from '../authority/errors'
import {a2pRegistration,normalizePhone,type TwilioCredentials} from './twilio.server'
const input=z.object({accountSid:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),authToken:z.string().min(1).max(1024),from:z.string().min(1).max(100)}).strict()
export type SmsInstallation={owner_id:string;account_sid:string;from_value:string;sealed_json:string;version:number}
export function smsSettings(env:PlatformBindings,origin:string){
 const db=env.DB,version=env.CONNECTION_ENCRYPTION_KEY_VERSION??'v1',keyring=environmentKeyring(version,v=>v===version?env.CONNECTION_ENCRYPTION_KEY:undefined)
 async function resolve(){
  const row=await db.prepare("SELECT * FROM sms_installation WHERE id='installation'").first<SmsInstallation>()
  if(!row)throw new AuthorityError('unconfigured','Save the installation Twilio account in Settings before sending SMS.',503)
  if(!await db.prepare("SELECT 1 FROM cradle_base_operators p JOIN oa_operators o ON o.id=p.base_id JOIN authority_principals a ON a.id=p.principal_id WHERE p.principal_id=? AND o.role='owner' AND o.status='active' AND a.state='active'").bind(row.owner_id).first())throw new AuthorityError('forbidden','The Twilio credential owner is no longer an active installation owner.')
  const credentials=JSON.parse(await open(keyring,'workspace','installation','twilio.sms',JSON.parse(row.sealed_json) as Sealed)) as TwilioCredentials
  return {row,credentials}
 }
 async function read(ctx:RequestContext){
  await ownerDelegationSnapshot(db,ctx,LAUNCH_APP_ID)
  if(!await db.prepare("SELECT 1 FROM sms_installation WHERE id='installation'").first())return {configured:false,from:'',a2pStatus:'Not configured',inboundUrl:origin+'/webhooks/twilio/inbound'}
  const {row,credentials}=await resolve()
  return {configured:true,accountSid:row.account_sid,from:row.from_value,a2pStatus:await a2pRegistration(env,credentials),inboundUrl:origin+'/webhooks/twilio/inbound'}
 }
 return {resolve,read,async save(ctx:RequestContext,value:unknown){
  const own=await ownerDelegationSnapshot(db,ctx,LAUNCH_APP_ID),credentials=input.parse(value)
  credentials.from=credentials.from.startsWith('MG')&&/^MG[A-Za-z0-9]+$/.test(credentials.from)?credentials.from:normalizePhone(credentials.from)
  if(!env.CONNECTION_ENCRYPTION_KEY)throw new AuthorityError('unconfigured','Configure the private connection encryption key before saving Twilio credentials.',503)
  // Validate access at the provider edge before replacing a working credential.
  await a2pRegistration(env,credentials)
  const sealed=await seal(keyring,'workspace','installation','twilio.sms',JSON.stringify(credentials))
  const result=await db.prepare(`INSERT INTO sms_installation(id,owner_id,account_sid,from_value,sealed_json,version,updated_at)
   SELECT 'installation',?,?,?,?,1,? WHERE ${own.guard.sql}
   ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,account_sid=excluded.account_sid,from_value=excluded.from_value,sealed_json=excluded.sealed_json,version=sms_installation.version+1,updated_at=excluded.updated_at`)
   .bind(ctx.principal.id,credentials.accountSid,credentials.from,JSON.stringify(sealed),ctx.now,...own.guard.values).run()
  if(!result.meta.changes)throw new AuthorityError('forbidden','Installation ownership changed before saving Twilio.')
  return read(ctx)
 },async remove(ctx:RequestContext){
  const own=await ownerDelegationSnapshot(db,ctx,LAUNCH_APP_ID)
  await db.prepare(`DELETE FROM sms_installation WHERE id='installation' AND (${own.guard.sql})`).bind(...own.guard.values).run()
  return read(ctx)
 }}
}
