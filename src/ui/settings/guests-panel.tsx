import { useState } from 'react'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'
import { AUTHORITY_ENTITY_IDS } from '../../domains/authority/contracts'
import type { Page } from '../../contracts/primitives'

type Guest={id:string;name:string;email:string;state:string;appId:string;version:number;licenseCount:number}
export function GuestsPanel(){
 const bases=useResource<Page<{id:string;name:string}>>('/api/v1/apps'),guests=useResource<{items:Guest[];licenseCount:number}>('/api/v1/guests')
 const [appId,setAppId]=useState(''),[name,setName]=useState(''),[email,setEmail]=useState('')
 const command=useCommand<{id:string}>('guest-invite')
 return <section className="cr-section"><h2>Guests</h2><ResourceState resource={guests.resource} operation="guest access" retry={guests.refresh}>{data=><>
  <p>Guests have read access to one base and use no licenses.</p>
  <ResourceState resource={bases.resource} operation="available bases" retry={bases.refresh}>{page=><form className="cr-form" onSubmit={event=>{event.preventDefault();void command.submit('/api/v1/guests/invite',{appId,name,email},[]).then(()=>guests.refresh())}}>
   <label className="cr-field">Guest name<input required maxLength={120} value={name} onChange={event=>setName(event.target.value)}/></label>
   <label className="cr-field">Guest email<input type="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label>
   <label className="cr-field">Shared base<select aria-label="Shared base" required value={appId} onChange={event=>setAppId(event.target.value)}><option value="">Choose a base</option>{page.items.map(base=><option key={base.id} value={base.id}>{base.name}</option>)}</select></label>
   <button className="cr-button" disabled={!appId||!['idle','failed','committed'].includes(command.result.state)}>Invite guest</button><CommandFeedback {...command}/>
  </form>}</ResourceState>
  <div className="cr-stack">{data.items.map(guest=><GuestAccess key={guest.id} guest={guest} onChanged={guests.refresh}/>)}</div>
 </>}</ResourceState></section>
}
function GuestAccess({guest,onChanged}:{guest:Guest;onChanged():void}){
 const command=useCommand(`guest-remove:${guest.id}`)
 return <article className="cr-card"><h3>{guest.name}</h3><p>{guest.email} · {guest.state} · {guest.licenseCount} licenses</p>{['invited','active'].includes(guest.state)&&<button className="cr-button cr-button--quiet" onClick={()=>void command.submit('/api/v1/commands/member.remove',{memberId:guest.id,reason:'Guest access ended'},[{ref:{appId:guest.appId,entityId:AUTHORITY_ENTITY_IDS.member,recordId:guest.id},version:guest.version}]).then(onChanged)}>Remove guest access</button>}<CommandFeedback {...command}/></article>
}
