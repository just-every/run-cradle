import { useEffect, useState } from 'react'
import type { Ref } from '../../contracts/primitives'
import type { ContractorReview } from '../../apps/repairs/contractor-runtime.server'
import type { Repair } from '../../apps/repairs/contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'
import { LinkedRecord } from '../records/linked-record'

export function ContractorSelection({id,current,onChanged}:{id:string;current:Ref|null;onChanged:()=>void}) {
  const review=useResource<ContractorReview>(`/api/v1/repairs/${id}/contractors`)
  const command=useCommand<Repair>(`select-contractor:${id}`)
  const [selected,setSelected]=useState<string|null>(null),[changing,setChanging]=useState(false)
  useEffect(()=>{setChanging(false);setSelected(null)},[current?.recordId])
  useEffect(()=>{if(command.result.state==='committed')onChanged();if(command.result.state==='failed'){setSelected(null);review.refresh()}},[command.result.state])
  return <section className="cr-card cr-contractor"><h2>Contractor</h2><ResourceState resource={review.resource} operation="eligible contractors" retry={review.refresh}>{data=>{
    const active=['active','waiting','blocked'].includes(data.caseState)
    const assigned=data.items.find(item=>item.contractor.ref.recordId===current?.recordId)
    const choices=data.items.filter(item=>item.contractor.ref.recordId!==current?.recordId)
    const editing=!current||changing
    return <>{current&&<div className="cr-contractor-current"><p>{assigned?.name??<LinkedRecord reference={current} />}</p>{!assigned&&<p className="cr-notice">Current eligibility needs review.</p>}{!editing&&<button type="button" className="cr-button cr-button--quiet" disabled={!active} onClick={()=>{command.reset();setChanging(true);review.refresh()}}>Change contractor</button>}</div>}{!active&&<p className="cr-notice">Resume this repair before changing its contractor.</p>}{editing&&<form className="cr-form" onSubmit={event=>{
      event.preventDefault()
      const item=choices.find(item=>item.contractor.ref.recordId===selected)
      if(item)void command.submit('/api/v1/commands/repair.assign-contractor',{workOrder:data.workOrder,contractor:item.contractor,eligibilityEvidence:item.evidence},[data.workOrder,item.contractor],data.controlEpoch)
    }}>
      {choices.length?<fieldset disabled={!active||!['idle','failed'].includes(command.result.state)}><legend>{current?'Other eligible contractors':'Eligible contractors'}</legend>{choices.map(item=><label className="cr-choice" key={item.contractor.ref.recordId}><input type="radio" name="repair-contractor" checked={selected===item.contractor.ref.recordId} onChange={()=>setSelected(item.contractor.ref.recordId)} />{item.name}</label>)}</fieldset>:<p className="cr-notice">{current?'No other currently eligible contractor is available.':'No currently eligible contractor is available for this trade and location.'}</p>}
      <div className="cr-actions">{choices.length>0&&<button className="cr-button" disabled={!selected||!active||!['idle','failed'].includes(command.result.state)}>Select contractor</button>}{current&&<button type="button" className="cr-button cr-button--quiet" disabled={['submitting','pending','unknown'].includes(command.result.state)} onClick={()=>{setChanging(false);setSelected(null)}}>Keep current contractor</button>}</div>
    </form>}<CommandFeedback {...command} /></>
  }}</ResourceState></section>
}
