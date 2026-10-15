import { z } from 'zod'
import type { Json } from '../../contracts/primitives'
import type { CommandDefinition } from '../../core/registry/commands'
import type { PolicyPort, RequestContext } from './ports'
import { createGrantService, canonicalJson } from './grants.server'
import { digest } from './crypto.server'
import { grantSpecSchema, idSchema } from './validators'
import { AuthorityError } from './errors'
const ref=z.object({appId:idSchema,entityId:idSchema,recordId:idSchema}).strict()
const expected=z.array(z.object({ref,version:z.number().int().positive()}).strict()).max(500)
const subject=(rows:z.infer<typeof expected>,id:string)=>{const item=rows.find(v=>v.ref.recordId===id);if(!item)throw new AuthorityError('validation','The current grant version is required.',400);return item}
/** The shared grant command family, usable without unrelated member/policy mutation ports. */
export function createGrantCommands(db:D1Database,policy:PolicyPort){
 const grants=createGrantService(db,policy)
 const visible=async(ctx:RequestContext,action:string)=>{if(ctx.principal.kind!=='human')return false;for(const row of (await db.prepare("SELECT app_id FROM authority_memberships WHERE principal_id=? AND state='active'").bind(ctx.principal.id).all<{app_id:string}>()).results){try{await policy.authorize(ctx,{appId:row.app_id,action,expected:[],cost:[],inputHash:''});return true}catch(error){if(!(error instanceof AuthorityError))throw error}}return false}
 const define=<I,O>(action:string,description:string,schema:z.ZodType<I>,prepare:CommandDefinition<I,O>['prepare'],replayIdentity:NonNullable<CommandDefinition<I,O>['replayIdentity']>):CommandDefinition<I,O>=>({action,description,inputSchema:z.toJSONSchema(schema) as Json,input:z.object({commandId:idSchema,expected,controlEpoch:z.number().int().nonnegative().optional(),input:schema}).strict(),visible:ctx=>visible(ctx,action),prepare,replayIdentity})
 return [
  define('grant.prepare','Prepare an inactive authority proposal.',z.object({spec:grantSpecSchema}).strict(),(ctx,v)=>grants.prepare(ctx,v.commandId,v.input.spec),async(_ctx,v)=>({appId:v.input.spec.appId,canonicalInputHash:await digest(canonicalJson(v.input.spec))})),
  define('grant.issue','Confirm the exact current authority proposal.',z.object({grantId:idSchema,confirmedImpactHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),(ctx,v)=>grants.issue(ctx,v.commandId,v.input.grantId,subject(v.expected,v.input.grantId).version,v.input.confirmedImpactHash),async(_ctx,v)=>{const current=subject(v.expected,v.input.grantId);return {appId:current.ref.appId,canonicalInputHash:await digest(canonicalJson({...v.input,expectedVersion:current.version}))}}),
  define('grant.revoke','Stop future use of a grant.',z.object({grantId:idSchema,reason:z.string().trim().min(1).max(2000)}).strict(),(ctx,v)=>grants.revoke(ctx,v.commandId,v.input.grantId,subject(v.expected,v.input.grantId).version,v.input.reason),async(_ctx,v)=>{const current=subject(v.expected,v.input.grantId);return {appId:current.ref.appId,canonicalInputHash:await digest(canonicalJson({...v.input,expectedVersion:current.version}))}}),
 ] as const
}
