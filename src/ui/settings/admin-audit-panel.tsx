import {useState,type FormEvent} from 'react'
import {useResource} from '../shared/api'
import {ResourceState,Timestamp} from '../shared/presentation'

type Entry={id:string;eventId:string;action:string;personId:string|null;person:string;baseId:string|null;createdAt:string}
type Audit={items:Entry[];people:{id:string;name:string}[];nextCursor:string|null}
const endpoint='/api/v1/launch/admin-audit'
export function AdminAuditPanel(){
 const [person,setPerson]=useState(''),[base,setBase]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[query,setQuery]=useState(''),[cursor,setCursor]=useState('')
 const audit=useResource<Audit>(endpoint+'?'+query+(cursor?'&cursor='+cursor:''))
 const bases=useResource<{items:{id:string;name:string}[]}>('/api/v1/apps')
 const apply=(event:FormEvent)=>{event.preventDefault();const params=new URLSearchParams();if(person)params.set('person',person);if(base)params.set('base',base);if(from)params.set('from',new Date(from).toISOString());if(to)params.set('to',new Date(to).toISOString());setCursor('');setQuery(params.toString())}
 const people=audit.resource.state==='ready'?audit.resource.data.people.map(person=>[person.id,person.name]):[]
 return <section className="cr-section" aria-label="Admin audit log"><h2>Admin audit log</h2><p>Review recorded command and identity events. Some sign-ins, exports and erasures are not yet recorded. Exports omit record values and credentials.</p>
  <form className="cr-stack" onSubmit={apply}>
   <label className="cr-field">Person<select value={person} onChange={e=>setPerson(e.target.value)}><option value="">All people</option>{people.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <label className="cr-field">Base<select value={base} onChange={e=>setBase(e.target.value)}><option value="">All bases</option>{bases.resource.state==='ready'&&bases.resource.data.items.map(app=><option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
   <label className="cr-field">From<input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label className="cr-field">Through<input type="datetime-local" value={to} onChange={e=>setTo(e.target.value)}/></label>
   <button className="cr-button" type="submit">Apply filters</button>
  </form>
  <ResourceState resource={audit.resource} operation="admin audit log" retry={audit.refresh}>{data=><div className="cr-stack">
   <div className="cr-actions"><a className="cr-button cr-button--quiet" href={endpoint+'?'+query+'&format=csv'} download>Export CSV</a><a className="cr-button cr-button--quiet" href={endpoint+'?'+query+'&format=json'} download>Export JSON</a></div>
   {data.items.length?<ul className="cr-stack">{data.items.map(row=><li key={row.id}><strong>{row.action}</strong><p>{row.person} · <Timestamp value={row.createdAt}/></p>{row.baseId&&<p>{bases.resource.state==='ready'?bases.resource.data.items.find(app=>app.id===row.baseId)?.name??'Unavailable base':'Base'}</p>}</li>)}</ul>:<p>No recorded actions match these filters.</p>}
   <div className="cr-actions">{cursor&&<button className="cr-button cr-button--quiet" onClick={()=>setCursor('')}>Newest entries</button>}{data.nextCursor&&<button className="cr-button cr-button--quiet" onClick={()=>setCursor(data.nextCursor!)}>Older entries</button>}</div>
  </div>}</ResourceState>
 </section>
}
