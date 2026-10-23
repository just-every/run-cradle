import { useState } from 'react'
import type { EntitySchema, Query } from '../../domains/records/contracts'
import {downloadExport} from './download-export'
export function ExportCsv({schema,query,viewId}:{schema:EntitySchema;query:Query;viewId?:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function download(format:'csv'|'xlsx'='csv'){setBusy(true);setError('');try{await downloadExport('/api/v1/records/export-'+format,{appId:schema.appId,entityId:schema.id,viewId,query:{...query,cursor:undefined}},format)}catch(e){setError(e instanceof Error?e.message:'Export failed.')}finally{setBusy(false)}}
 return <div className="cr-records-export"><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={()=>void download()}>{busy?'Exporting…':'Export CSV'}</button><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={()=>void download('xlsx')}>Export workbook (.xlsx)</button>{error&&<p role="alert" className="cr-error">{error}</p>}</div>
}
