import { useState } from 'react'
import { useDocumentSession } from '../../../core/app/document-context'
import type { ProposalSummary } from '../../../domains/records/manual/proposal-contracts'
import { useResource } from '../../shared/api'
import { ResourceState, Timestamp } from '../../shared/presentation'
import { ProposalReview } from './proposal-review'
const stateLabel:Record<ProposalSummary['state'],string>={pending:'Waiting for your review',adopted:'Adopted',declined:'Declined',stale:'Stale',withdrawn:'Withdrawn'}
/** Proposals made with keys the owner issued. Nothing in them is live until the owner adopts one. */
export function AgentProposals({onOpenChange}:{onOpenChange:(open:boolean)=>void}){
 const reviewer=useDocumentSession()?.proposalReviewer===true
 const list=useResource<{items:ProposalSummary[]}>(reviewer?'/api/v1/records/proposals':null),[open,setOpen]=useState<string|null>(null)
 const choose=(id:string|null)=>{setOpen(id);onOpenChange(id!==null);if(id===null)list.refresh()}
 if(!reviewer)return null
 if(open)return <ProposalReview id={open} onClose={()=>choose(null)} />
 // Only the installation owner has proposals to review; for anyone else, and while loading, the list is absent.
 if(list.resource.state==='failed')return <ResourceState resource={list.resource} operation="agent proposals" retry={list.refresh}>{()=>null}</ResourceState>
 if(list.resource.state!=='ready')return null
 return <>{(data=>data.items.length?<section className="cr-card cr-stack" aria-labelledby="agent-proposals"><h2 id="agent-proposals">Proposed by an agent</h2><p>An agent with a proposing key suggested these changes. Nothing changes until you adopt one.</p><ul className="cr-stack" aria-label="Agent proposals">{data.items.map(item=><li key={item.id} className="cr-record-cards"><article className="cr-card"><h3>{item.summary}</h3><p>{item.keyName} · <Timestamp value={item.createdAt} /> · {stateLabel[item.state]}{item.state==='pending'&&!item.keyCurrent?' · key revoked or expired':''}</p><button type="button" className="cr-button cr-button--quiet" onClick={()=>choose(item.id)}>{item.state==='pending'?'Review':'View'} proposal from {item.keyName}</button></article></li>)}</ul></section>:null)(list.resource.data)}</>
}
