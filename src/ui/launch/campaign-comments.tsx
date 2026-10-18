import { useState } from 'react'
import { LAUNCH_APP_ID, launchEntities } from '../../apps/launch/contracts'
import type { Page } from '../../contracts/primitives'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'

type Comment = { id: string; version: number; body: string; authorName: string }
export function CampaignComments({campaign,comments,onChanged}:{campaign:{id:string;version:number};comments:Comment[];onChanged:()=>void}) {
 const people=useResource<Page<{id:string;name:string}>>('/api/v1/launch/owners')
 const command=useCommand(`launch-comments:${campaign.id}`)
 const [body,setBody]=useState(''),[mentions,setMentions]=useState<string[]>([])
 const expected=[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,recordId:campaign.id},version:campaign.version}]
 const busy=['submitting','pending','unknown'].includes(command.result.state)
 function refresh(){onChanged()}
 async function post(){const saved=await command.submit('/api/v1/commands/launch.comment.create',{campaignId:campaign.id,body,mentions},expected);if(saved){setBody('');setMentions([]);refresh()}}
 async function remove(comment:Comment){if(await command.submit('/api/v1/commands/launch.comment.delete',{id:comment.id,version:comment.version},expected))refresh()}
 return <section aria-label="Campaign comments" className="cr-form"><div className="cr-stack">{comments.length?comments.map(comment=><article className="cr-detail" key={comment.id}><p><strong>{comment.authorName}</strong></p><p className="cr-comment-body">{comment.body}</p><button className="cr-button cr-button--quiet" disabled={busy} onClick={()=>void remove(comment)}>Delete comment</button></article>):<p>No comments yet.</p>}</div><form className="cr-form" onSubmit={event=>{event.preventDefault();void post()}}><label className="cr-field">Add a campaign comment<textarea required maxLength={10000} value={body} onChange={event=>setBody(event.target.value)} /></label><ResourceState resource={people.resource} operation="mention people" retry={people.refresh}>{data=><fieldset><legend>Notify people mentioned</legend>{data.items.map(person=><label className="cr-choice" key={person.id}><input type="checkbox" checked={mentions.includes(person.id)} onChange={event=>setMentions(ids=>event.target.checked?[...ids,person.id]:ids.filter(id=>id!==person.id))} />{person.name}</label>)}</fieldset>}</ResourceState><button className="cr-button" disabled={busy||!body.trim()}>Post comment</button></form><CommandFeedback {...command} /></section>
}
