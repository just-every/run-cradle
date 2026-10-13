#!/usr/bin/env node
/** A scripted agent: it reads only a brief, then proposes through a proposing key's door. No model runs.
 * Usage: CRADLE_PROPOSAL_KEY=... node scripts/agent-proposal-client.mjs --brief FILE --origin URL [--face mcp|rest] [--out FILE] */
import {readFile,writeFile} from 'node:fs/promises'
import {parseArgs} from 'node:util'
import {parseBrief} from './agent-client/brief.mjs'
import {buildProposal} from './agent-client/proposal.mjs'
import {door} from './agent-client/door.mjs'
const {values}=parseArgs({options:{brief:{type:'string'},origin:{type:'string'},face:{type:'string',default:'mcp'},out:{type:'string'}}})
const key=process.env.CRADLE_PROPOSAL_KEY
if(!values.brief||!values.origin||!key){console.error('Set CRADLE_PROPOSAL_KEY and pass --brief FILE --origin URL.');process.exit(2)}
const agent=door(values.origin.replace(/\/$/,''),key,values.face)
const tools=await agent.tools()
for(const tool of ['schema.read','schema.propose','schema.proposal'])if(!tools.includes(tool))throw new Error(`The door does not offer ${tool}.`)
const brief=parseBrief(await readFile(values.brief,'utf8')),current=await agent.schema()
const input=buildProposal(brief,current),proposal=await agent.propose(input)
const report={brief:values.brief,face:values.face,tools,appId:current.appId,input,proposal:{id:proposal.id,state:proposal.state,summary:proposal.summary,previewHash:proposal.previewHash,impacts:proposal.impacts,metadata:proposal.metadata}}
if(values.out)await writeFile(values.out,JSON.stringify(report,null,1)+'\n')
console.log(`PROPOSED ${proposal.id} ${proposal.state}: ${proposal.summary}`)
for(const impact of proposal.impacts)console.log(`  ${impact.label} · ${impact.count} affected records · ${impact.changes.join('; ')}`)
for(const line of proposal.metadata)console.log(`  ${line}`)
