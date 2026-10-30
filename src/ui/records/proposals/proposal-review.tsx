import { useState } from 'react'
import { createUlid } from '../../../core/shared/ids'
import type { OwnerProposal } from '../../../domains/records/manual/proposal-contracts'
import { readApi, useCommand, useResource } from '../../shared/api'
import { CommandFeedback, ResourceState, Timestamp } from '../../shared/presentation'
import { SchemaImpactReview } from '../schema/impact-review'
import { CalculationReview } from '../schema/calculation-review'
/** The existing schema-impact screen for one proposal, labelled with the key that proposed it. */
export function ProposalReview({id,onClose}:{id:string;onClose:()=>void}){
 const proposal=useResource<OwnerProposal>(`/api/v1/records/proposals/${id}`)
 return <section className="cr-card cr-stack"><header className="cr-page-header"><h2>Proposed by an agent</h2><button type="button" className="cr-button cr-button--quiet" onClick={onClose}>Back to records</button></header><ResourceState resource={proposal.resource} operation="agent proposal" retry={proposal.refresh}>{value=><Decision proposal={value} onClose={onClose} />}</ResourceState></section>
}
function Decision({proposal,onClose}:{proposal:OwnerProposal;onClose:()=>void}){
 const command=useCommand<{appId:string;releaseId:string}>(`proposal:${proposal.id}`),[confirm,setConfirm]=useState(false),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const open=proposal.state==='pending'&&proposal.keyCurrent
 async function decline(){setBusy(true);setError('');try{await readApi(`/api/v1/records/proposals/${proposal.id}/decline`,{method:'POST',body:JSON.stringify({commandId:createUlid(),note})});onClose()}catch(e){setError(e instanceof Error?e.message:'Could not decline the proposal.')}finally{setBusy(false)}}
 if(command.result.state==='committed')return <div className="cr-stack"><h3>Base ready</h3><p>The proposal is adopted. Records, permissions, views and forms were updated together.</p><a className="cr-button" href={`/app/records/${command.result.value.appId}/${proposal.schemas[0]!.id}`}>Open {proposal.baseName}</a></div>
 return <div className="cr-stack">
  <p><strong>{proposal.summary}</strong></p>
  <p>From the key “{proposal.keyName}” · <Timestamp value={proposal.createdAt} /></p>
  {proposal.note&&<div className="cr-card"><h3>Note from the agent</h3><p>{proposal.note}</p><p>This is text the agent wrote. It grants nothing and runs nothing.</p></div>}
  {proposal.state==='stale'&&<p className="cr-error" role="status">This proposal is stale: data, schema or authority changed since it was made. Ask the agent to propose again.</p>}
  {proposal.state==='pending'&&!proposal.keyCurrent&&<p className="cr-error" role="status">This proposal came from a key that is revoked or expired, so it cannot be adopted. Ask the agent to propose again with a current key.</p>}
  {proposal.state==='declined'&&<p>You declined this proposal{proposal.declineNote?`: ${proposal.declineNote}`:'.'}</p>}
  {proposal.state==='adopted'&&<p>You adopted this proposal.</p>}
  {proposal.state==='withdrawn'&&<p>The agent withdrew this proposal.</p>}
  <SchemaImpactReview appId={proposal.appId} impacts={proposal.impacts} schemas={proposal.schemas} access={proposal.access} recovery={proposal.recovery} />
  <CalculationReview calculations={proposal.calculations} schemas={proposal.schemas} />
  {proposal.metadata.length>0&&<><h3>Views and forms</h3><ul>{proposal.metadata.map(line=><li key={line}>{line}</li>)}</ul></>}
  {open&&<><label className="cr-choice"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)} />I reviewed the data changes and owner access.</label>
   <div className="cr-actions"><button type="button" className="cr-button" disabled={!confirm||!['idle','failed'].includes(command.result.state)} onClick={()=>void command.submit('/api/v1/commands/release.adopt',{kind:'agent_proposal',proposalId:proposal.id},[])}>Adopt schema</button></div>
   <CommandFeedback {...command} />
   <label className="cr-field">Note for the agent (optional)<textarea value={note} maxLength={2000} rows={2} onChange={e=>setNote(e.target.value)} /></label>
   <div className="cr-actions"><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={()=>void decline()}>Decline proposal</button></div></>}
  {error&&<p className="cr-error" role="alert">{error}</p>}
 </div>
}
