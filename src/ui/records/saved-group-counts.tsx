import {useState} from 'react'
import type {EntitySchema} from '../../domains/records/contracts'
import type {ViewSummarySnapshot} from './view-summary-query'
import {CellDisplay} from './record-fields'
export function SavedGroupCounts({schema,snapshot,showFieldNames=false}:{schema:EntitySchema;snapshot:ViewSummarySnapshot;showFieldNames?:boolean}){
 const [limit,setLimit]=useState(50)
 if(!snapshot.groupBy.length)return null
 if(snapshot.groupsUnavailable)return <p>{snapshot.groupsUnavailable}</p>
 return <div><ul aria-label="Group counts">{snapshot.groups.slice(0,limit).map(({key,row,count})=><li key={key}>{snapshot.groupBy.map((id,index)=><span key={id}>{index>0?' · ':''}{showFieldNames?`${schema.fields.find(f=>f.id===id)?.label}: `:''}<CellDisplay appId={schema.appId} field={schema.fields.find(f=>f.id===id)} cell={row.fields[id]} /></span>)} · {count}</li>)}</ul>{snapshot.groups.length>limit&&<button type="button" className="cr-button cr-button--quiet" onClick={()=>setLimit(value=>value+50)}>More group counts</button>}</div>
}
