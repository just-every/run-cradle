import { useState } from 'react'
import { createUlid } from '../../../core/shared/ids'
import type { BaseCollaborator } from '../../../domains/records/manual/base-role'
import { baseRoles } from '../../../domains/records/manual/base-role'
import { readApi, useResource } from '../../shared/api'
import { ResourceState } from '../../shared/presentation'
export function BaseCollaborators({appId}:{appId:string}){
 const members=useResource<{items:BaseCollaborator[]}>(`/api/v1/records/bases/${appId}/collaborators`)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function save(member:BaseCollaborator,role:BaseCollaborator['role'],destructive:boolean){
  if(!role)return;setBusy(true);setError('')
  try{await readApi(`/api/v1/records/bases/${appId}/collaborators`,{method:'POST',body:JSON.stringify({commandId:createUlid(),principalId:member.id,role,destructive,version:member.version})});members.refresh()}
  catch(error){setError((error as Error).message)}finally{setBusy(false)}
 }
 return <section className="cr-card cr-form"><h2>Base collaborators</h2><p>Assign an existing operator a role in this base. A role grants access to all its tables and fields. Saving a role replaces this operator’s previous base access with the role defaults.</p><p>Owners manage roles and adopt schema changes. Creators adopt additive changes and author forms. Editors manage collaborative views and records. Commenters and read-only members save personal views.</p>{error&&<p role="alert">{error}</p>}<ResourceState resource={members.resource} operation="base collaborators" retry={members.refresh}>{data=><div className="cr-stack">{data.items.map(member=><Collaborator key={`${member.id}:${member.version}`} member={member} busy={busy} onSave={save} />)}</div>}</ResourceState></section>
}
function Collaborator({member,busy,onSave}:{member:BaseCollaborator;busy:boolean;onSave:(member:BaseCollaborator,role:BaseCollaborator['role'],destructive:boolean)=>Promise<void>}){
 const [role,setRole]=useState(member.role??'read-only'),[destructive,setDestructive]=useState(member.destructive)
 return <form className="cr-records-panel cr-form" aria-label={`Role for ${member.name}`} onSubmit={event=>{event.preventDefault();void onSave(member,role,destructive)}}><h3>{member.name}</h3><p>{member.email}</p>{member.originalOwner?<p>Original base owner</p>:<><label className="cr-field">Base role<select aria-label="Base role" value={role} onChange={event=>setRole(event.target.value as typeof role)}>{baseRoles.map(value=><option key={value} value={value}>{value}</option>)}</select></label>{role==='creator'&&<label className="cr-choice"><input type="checkbox" checked={destructive} onChange={event=>setDestructive(event.target.checked)} />May adopt destructive changes after impact review</label>}<button className="cr-button" disabled={busy}>{member.role?'Save base role':'Add to this base'}</button></>}</form>
}
