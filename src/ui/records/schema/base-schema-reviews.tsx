import { useState } from 'react'
import type { ManualPreview } from '../../../domains/records/manual/contracts'
import { useCommand, useResource } from '../../shared/api'
import { CommandFeedback, ResourceState } from '../../shared/presentation'
import { SchemaImpactReview } from './impact-review'
import { CalculationReview } from './calculation-review'
export function BaseSchemaReviews({appId}:{appId:string}){
 const reviews=useResource<{items:ManualPreview[]}>(`/api/v1/records/bases/${appId}/reviews`)
 return <section className="cr-card cr-form cr-schema-reviews"><h2>Schema changes awaiting an owner</h2><ResourceState resource={reviews.resource} operation="schema reviews" retry={reviews.refresh}>{data=>data.items.length?<>{data.items.map(preview=><Review key={preview.id} preview={preview} />)}</>:<p>No changes awaiting review.</p>}</ResourceState></section>
}
function Review({preview}:{preview:ManualPreview}){
 const [confirm,setConfirm]=useState(false),command=useCommand<{appId:string;releaseId:string}>(`base-review:${preview.id}`)
 const releaseId=command.result.state==='committed'?command.result.value.releaseId:undefined
 return <article className="cr-records-panel cr-form"><h3>{preview.name}</h3><SchemaImpactReview appId={preview.appId} impacts={preview.impacts} schemas={preview.schemas} access={preview.access} recovery={preview.recovery} /><CalculationReview calculations={preview.calculations??[]} schemas={preview.schemas} /><label className="cr-choice"><input type="checkbox" checked={confirm} onChange={event=>setConfirm(event.target.checked)} />I reviewed this schema change and its recovery data.</label><button className="cr-button" disabled={!confirm||preview.impacts.some(impact=>!!impact.refusals?.length||(impact.violatingRecordCount??0)>0)||!['idle','failed'].includes(command.result.state)} onClick={()=>void command.submit('/api/v1/commands/release.adopt',{kind:'manual_schema',previewId:preview.id},[])}>Adopt reviewed schema</button><CommandFeedback {...command} />{releaseId&&<div className="cr-schema-downloads">{preview.impacts.filter(impact=>impact.removedFields.length>0||impact.deletedTable||impact.conversions?.some(conversion=>conversion.losses.length>0)).map(impact=><a className="cr-link" key={impact.entityId} href={`/api/v1/records/releases/${releaseId}/recovery/${impact.entityId}.csv`} download>Download recovery data — {impact.label}</a>)}</div>}</article>
}
