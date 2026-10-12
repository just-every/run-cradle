import { useState } from 'react'
import type { CorrespondenceReview } from '../../../domains/records/base-transfer/correspondence-format'
type Reference=CorrespondenceReview['references'][number]
/** Render a bounded candidate page; original row coordinates remain selectable. */
export function CorrespondenceCandidates({reference,busy,onSelect}:{reference:Reference;busy:boolean;onSelect:(rowKey:string)=>void}){
 const [page,setPage]=useState(()=>Math.floor(reference.candidates.findIndex(row=>row.rowKey===reference.selectedRowKey)/25))
 const pages=Math.max(1,Math.ceil(reference.candidates.length/25)),current=Math.max(0,Math.min(page,pages-1)),start=current*25,visible=reference.candidates.slice(start,start+25),selected=reference.candidates.find(row=>row.rowKey===reference.selectedRowKey)!
 const choices=visible.some(row=>row.rowKey===selected.rowKey)?visible:[selected,...visible]
 return <><p>{reference.candidates.length} exact candidates in {reference.targetTableKey}. Showing {start+1}–{Math.min(start+25,reference.candidates.length)}. The selected row remains available on every page.</p><label className="cr-field">Selected target for {reference.rowKey} {reference.columnKey} token {reference.occurrence+1}<select disabled={busy} value={reference.selectedRowKey} onChange={event=>onSelect(event.target.value)}>{choices.map(candidate=><option key={candidate.rowKey} value={candidate.rowKey}>{candidate.rowKey} · {JSON.stringify(candidate.values).slice(0,160)}</option>)}</select></label><div className="cr-actions"><button type="button" className="cr-button cr-button--quiet" disabled={busy||current===0} onClick={()=>setPage(current-1)}>Previous candidate rows</button><button type="button" className="cr-button cr-button--quiet" disabled={busy||current>=pages-1} onClick={()=>setPage(current+1)}>Next candidate rows</button></div><p>Complete selected row values: <code>{JSON.stringify(selected.values)}</code></p></>
}
