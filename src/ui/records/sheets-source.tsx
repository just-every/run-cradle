import {useEffect,useState} from 'react'
import {readApi} from '../shared/api'
import type {Connection} from '../../domains/connections/contracts'
import type {WorkbookSheet} from '../../domains/records/workbooks/read'
export type SheetsCapture={connectionId:string;filename:string;content:string;sheets:WorkbookSheet[]}
export function SheetsSource({disabled,onLoad}:{disabled:boolean;onLoad(source:SheetsCapture):void}){
 const [connections,setConnections]=useState<Connection[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{let live=true;(async()=>{const all:Connection[]=[];let cursor:string|null=null;do{const page:{items:Connection[];nextCursor:string|null}=(await readApi<{items:Connection[];nextCursor:string|null}>('/api/v1/connections?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''))).data;all.push(...page.items);cursor=page.nextCursor}while(cursor);if(live)setConnections(all.filter(c=>c.adapterId==='google-sheets'&&c.state==='connected'))})().catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[])
 async function load(){setBusy(true);setError('');try{const source=(await readApi<Omit<SheetsCapture,'connectionId'>>('/api/v1/records/sheets-source',{method:'POST',body:JSON.stringify({connectionId:selected})})).data;onLoad({...source,connectionId:selected})}catch(e){setError(e instanceof Error?e.message:'Could not read Google Sheets.')}finally{setBusy(false)}}
 return <div className="cr-stack"><label className="cr-field">Google Sheets connection<select disabled={disabled||busy} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a connected spreadsheet</option>{connections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><p>Connect a spreadsheet with read-only access in the base’s Connections settings. Reading it here prepares a snapshot for review.</p><button type="button" className="cr-button cr-button--quiet" disabled={disabled||busy||!selected} onClick={()=>void load()}>{busy?'Reading spreadsheet…':'Read Google Sheets'}</button>{error&&<p className="cr-error" role="alert">{error}</p>}</div>
}
