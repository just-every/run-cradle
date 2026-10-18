import { useState } from 'react'
import type { ManualPreview } from '../../../domains/records/manual/contracts'
import { useCommand, useResource } from '../../shared/api'
import { CommandFeedback, ResourceState } from '../../shared/presentation'
import { SchemaImpactReview } from './impact-review'
import { CalculationReview } from './calculation-review'
export function BaseSchemaReviews({appId}:{appId:string}){
 const reviews=useResource<{items:ManualPreview[]}>(`/api/v1/records/bases/${appId}/reviews`)
 return <section className="cr-card cr-form"><h2>Schema changes awaiting an owner</h2><ResourceState resource={reviews.resource} operation="schema reviews" retry={reviews.refresh}>{data=>data.items.length?<>{data.items.map(preview=><Review key={preview.id} preview={preview} />)}</>:<p>No changes awaiting review.</p>}</ResourceState></section>
}
function Review({preview}:{preview:ManualPreview}){
 const [confirm,setConfirm]=useState(false),command=useCommand<{appId:string}>(`base-review:${preview.id}`)
 return <article className="cr-records-panel cr-form"><h3>{preview.name}</h3><SchemaImpactReview appId={preview.appId} impacts={preview.impacts} schemas={preview.schemas} access={preview.access} recovery={preview.recovery} /><CalculationReview calculations={preview.calculations??[]} schemas={preview.schemas} /><label className="cr-choice"><input type="checkbox" checked={confirm} onChange={event=>setConfirm(event.target.checked)} />I reviewed this schema change and its recovery data.</label><button className="cr-button" disabled={!confirm||!['idle','failed'].includes(command.result.state)} onClick={()=>void command.submit('/api/v1/commands/release.adopt',{kind:'manual_schema',previewId:preview.id},[])}>Adopt reviewed schema</button><CommandFeedback {...command} /></article>
}
