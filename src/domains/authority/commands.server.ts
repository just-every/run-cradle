import { z } from 'zod'
import type { Json } from '../../contracts/primitives'
import type { CommandDefinition } from '../../core/registry/commands'
import type { PolicyPort, RequestContext } from './ports'
import { createGrantCommands } from './grant-commands.server'
import { createMemberService, type MemberLifecyclePort } from './members.server'
import { createPolicyManagement, type PolicyImpactPort } from './policies.server'
import { idSchema, policyRuleSchema } from './validators'
import { AuthorityError } from './errors'
const ref=z.object({appId:idSchema,entityId:idSchema,recordId:idSchema}).strict()
const expected=z.array(z.object({ref,version:z.number().int().positive()}).strict()).max(500)
const version=(rows:z.infer<typeof expected>,id:string)=>{const item=rows.find(v=>v.ref.recordId===id);if(!item)throw new AuthorityError('validation','The current subject version is required.',400);return item.version}
const app=(rows:z.infer<typeof expected>)=>{if(!rows[0])throw new AuthorityError('validation','The current app-scoped subject is required.',400);return rows[0].ref.appId}
export const createAuthorityCommands=(db:D1Database,policy:PolicyPort,dependencies:{memberLifecycle:MemberLifecyclePort;policyImpact:PolicyImpactPort})=>{
 const members=createMemberService(db,policy,dependencies.memberLifecycle),policies=createPolicyManagement(db,policy,dependencies.policyImpact)
 const visible=async(ctx:RequestContext,action:string)=>{if(ctx.principal.kind!=='human')return false;const memberships=await db.prepare(`SELECT app_id FROM authority_memberships WHERE principal_id=? AND state='active'`).bind(ctx.principal.id).all<{app_id:string}>();for(const m of memberships.results){try{await policy.authorize(ctx,{appId:m.app_id,action,expected:[],cost:[],inputHash:''});return true}catch(error){if(!(error instanceof AuthorityError))throw error}}return false}
 const define=<I,O>(action:string,description:string,schema:z.ZodType<I>,prepare:CommandDefinition<I,O>['prepare']):CommandDefinition<I,O>=>({action,description,inputSchema:z.toJSONSchema(schema) as Json,input:z.object({commandId:idSchema,expected,controlEpoch:z.number().int().nonnegative().optional(),input:schema}).strict(),visible:ctx=>visible(ctx,action),prepare})
 const policyInput=z.object({id:idSchema,appId:idSchema,name:z.string().min(1).max(200),version:z.number().int().positive(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),rules:z.array(policyRuleSchema).max(1000)}).strict()
 return [
 ...createGrantCommands(db,policy),
 define('member.invite','Invite a collaborator to explicitly selected apps.',z.object({email:z.email().max(254),name:z.string().trim().min(1).max(200),scopes:z.array(z.object({appId:idSchema,policyId:idSchema,legacy:z.literal(false)}).strict()).min(1).max(100)}).strict(),(ctx,v)=>members.invite(ctx,v.commandId,v.input)),
 define('member.remove','Remove a collaborator after resolving blocking ownership.',z.object({memberId:idSchema,reason:z.string().trim().min(1).max(2000)}).strict(),(ctx,v)=>members.remove(ctx,v.commandId,app(v.expected),v.input.memberId,version(v.expected,v.input.memberId),v.input.reason)),
 define('member.erase','Erase a removed collaborator and retain anonymous attribution.',z.object({memberId:idSchema,reason:z.string().trim().min(1).max(2000),keepCopies:z.array(z.string().min(1).max(200)).max(500).optional()}).strict(),(ctx,v)=>members.erase(ctx,v.commandId,app(v.expected),v.input.memberId,version(v.expected,v.input.memberId),v.input.keepCopies??[])),
 define('policy.preview','Review exact access changes before adoption.',z.object({policy:policyInput}).strict(),(ctx,v)=>policies.preview(ctx,v.commandId,v.input.policy)),
 define('policy.adopt','Adopt a current explicitly approved access preview.',z.object({previewId:idSchema,decisionId:idSchema}).strict(),(ctx,v)=>policies.adopt(ctx,v.commandId,v.input.previewId,v.input.decisionId)),
 ] as const
}
