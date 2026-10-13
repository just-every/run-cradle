import { z } from 'zod'
import type { Json } from '../../../contracts/primitives'
import type { CommandRegistry } from '../../../core/registry/commands'
import { canonicalHash } from '../../admission/canonical'
import { AdmissionError } from '../../admission/errors'
import { idSchema, refSchema } from '../validators'
import { proposalSchema } from './proposal-contracts'
import type { createProposalAgent } from './proposal-agent.server'

const noRevisions=z.array(z.object({ref:refSchema,version:z.number().int().positive()}).strict()).max(0)
const proposeInput=z.object({commandId:idSchema,expected:noRevisions,input:proposalSchema}).strict()
const withdrawInput=z.object({commandId:idSchema,expected:noRevisions,input:z.object({proposalId:idSchema}).strict()}).strict()
const proposalInput=z.object({proposalId:idSchema}).strict()
const none=z.object({}).strict()
const json=(schema:z.ZodType)=>z.toJSONSchema(schema,{io:'input'}) as Json

/** The proposal door's tools. The same definitions serve REST and MCP, so both faces answer alike. */
export function registerProposalTools(registry:CommandRegistry,agent:ReturnType<typeof createProposalAgent>){
 const appOf=(ctx:{principal:{proposer?:{appId:string}}})=>{if(!ctx.principal.proposer)throw new AdmissionError('not_found','Unknown command.');return ctx.principal.proposer.appId}
 registry.registerQuery({action:'schema.read',proposer:true,input:none,inputSchema:json(none),
  description:'Read the base this key may propose for: its tables, typed fields, links, lookups, views and forms, plus unused identifiers for new tables, fields and options. A key for a new base gets an empty table list.',
  run:ctx=>agent.schema(ctx)})
 registry.register({action:'schema.propose',proposer:true,input:proposeInput,inputSchema:json(proposeInput),visible:async()=>true,
  description:'Propose the complete next schema for this base (every existing table, plus new tables and fields; omitting a table or field proposes its removal), with optional grid, cards, board or calendar views and record forms, and a note to the owner. Returns the impact preview the owner will review. Nothing changes until the owner adopts it.',
  replayIdentity:async(ctx,command)=>({appId:appOf(ctx),canonicalInputHash:await canonicalHash({action:'schema.propose',input:command.input})}),
  prepare:(ctx,command)=>agent.propose(ctx,command.commandId,command.input)})
 registry.registerQuery({action:'schema.proposals',proposer:true,input:none,inputSchema:json(none),
  description:'List the proposals made with this key and their state: pending, adopted, declined, stale or withdrawn.',
  run:ctx=>agent.mine(ctx)})
 registry.registerQuery({action:'schema.proposal',proposer:true,input:proposalInput,inputSchema:json(proposalInput),
  description:'Read one proposal made with this key: its state, impact preview and any note the owner left when declining.',
  run:(ctx,input)=>agent.one(ctx,input.proposalId)})
 registry.register({action:'schema.withdraw',proposer:true,input:withdrawInput,inputSchema:json(withdrawInput),visible:async()=>true,
  description:'Withdraw a pending proposal made with this key.',
  replayIdentity:async(ctx,command)=>({appId:appOf(ctx),canonicalInputHash:await canonicalHash({action:'schema.withdraw',proposalId:command.input.proposalId})}),
  prepare:(ctx,command)=>agent.withdraw(ctx,command.commandId,command.input.proposalId)})
}
