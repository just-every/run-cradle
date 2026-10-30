import { useState } from 'react'
import './calculation-review.css'
import type { CalculationPreview } from '../../../domains/records/manual/contracts'
import type { EntitySchema } from '../../../domains/records/contracts'
import { CellDisplay } from '../record-fields'

export function CalculationReview({calculations,schemas}:{calculations:CalculationPreview[];schemas:EntitySchema[]}){
 if(!calculations.length)return null
 return <section className="cr-calculation-review"><h3>Calculated results on current records</h3>{calculations.map(calculation=><CalculationReport key={`${calculation.entityId}:${calculation.fieldId}`} calculation={calculation} schema={schemas.find(s=>s.id===calculation.entityId)!} />)}</section>
}

function CalculationReport({calculation,schema}:{calculation:CalculationPreview;schema:EntitySchema}){
 const [page,setPage]=useState(0),field=schema.fields.find(f=>f.id===calculation.fieldId)!
 const complete=calculation.changes!==undefined,cells=calculation.changes??calculation.samples,pageSize=20
 const pages=Math.max(1,Math.ceil(cells.length/pageSize)),current=Math.min(page,pages-1),visible=cells.slice(current*pageSize,(current+1)*pageSize)
 function download(){
  const blob=new Blob([JSON.stringify({appId:schema.appId,entityId:schema.id,entityLabel:schema.label,fieldId:field.id,fieldLabel:field.label,resultType:calculation.resultType,totalRecords:calculation.totalRecords,changedCellCount:cells.length,changes:calculation.changes},null,2)],{type:'application/json'})
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`calculation-changes-${schema.id}-${field.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
 }
 return <article className="cr-tile" aria-label={`${schema.label}: ${calculation.label}`}>
  <h4>{schema.label} · {calculation.label}</h4>
  <p className="cr-muted">Result type: {calculation.resultType}. {complete?`${cells.length} changed cells across ${calculation.totalRecords} current records. Every record was compared; unchanged cells are excluded.`:`Sample only: ${cells.length} of ${calculation.totalRecords} current records shown. ${calculation.incompleteReason??'This retained preview predates complete linked and transitive change reports. Preview again to compare every current record.'}`} Adoption requires the reviewed data, schema and authority to remain unchanged.</p>
  {complete&&<div className="cr-actions"><button type="button" className="cr-button cr-button--quiet" onClick={download}>Download all changed cells</button></div>}
  {!cells.length?<p>{complete?'No calculated cells change.':'No current records to preview.'}</p>:<>
   <table className="cr-table"><thead><tr><th scope="col">Record</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>{visible.map(sample=><tr key={sample.recordId} data-record-id={sample.recordId}>
    <th scope="row"><a className="cr-link" href={`/app/records/${schema.appId}/${schema.id}/${sample.recordId}`}>{sample.recordLabel}</a><span className="cr-calculation-record-id">{sample.recordId}</span></th>
    <td>{sample.before?<CellDisplay cell={sample.before} field={field} appId={schema.appId} />:'New calculation'}</td><td><CellDisplay cell={sample.after} field={field} appId={schema.appId} /></td>
   </tr>)}</tbody></table>
   {pages>1&&<nav className="cr-actions" aria-label={`${calculation.label} report pages`}><button type="button" className="cr-button cr-button--quiet" disabled={current===0} onClick={()=>setPage(current-1)}>Previous changed cells</button><span role="status">Page {current+1} of {pages} · {current*pageSize+1}–{Math.min((current+1)*pageSize,cells.length)} of {cells.length} cells</span><button type="button" className="cr-button cr-button--quiet" disabled={current+1===pages} onClick={()=>setPage(current+1)}>Next changed cells</button></nav>}
  </>}
 </article>
}
