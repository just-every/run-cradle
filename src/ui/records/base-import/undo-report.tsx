import type { ImportReversalReport } from '../../../domains/records/base-transfer/contracts'
import type { Json } from '../../../../vendor/base/modules/import-kit/src/types'

const shown=(value:Json|undefined)=>value===undefined||value===null?'unavailable':typeof value==='string'?value:JSON.stringify(value)
export function ImportUndoReport({report}:{report:ImportReversalReport}) {
 return <section className="cr-card cr-stack" aria-live="polite" style={{minWidth:0,overflowWrap:'anywhere'}}>
  <h3>{report.terminal?'Reversal complete':'Reversing imported effects'}</h3>
  <p>{report.processed} of {report.total} effects resolved: {report.reversed} reversed, {report.retained} retained, {report.remaining} remaining.</p>
  <progress value={report.processed} max={Math.max(1,report.total)} aria-label="Import effects reversed or retained" />
  <p>The base schema and exact original uploads remain. Table deletion is unsupported.</p>
  {report.conflicts.length>0&&<><h4>Preserved conflicts</h4><p>Edited effects and records needed by retained links remain attributed to this import. Their original applied values and observed values are included in the downloaded report.</p><ul>{report.conflicts.map(conflict=>{
   const evidence=(conflict.evidence??{}) as Record<string,Json>
   return <li key={conflict.effectId}><strong>{shown(evidence.tableLabel)} · {shown(evidence.recordPrimary)}</strong> — {conflict.reason==='edited'?'edited after import':'required by retained data'}<p>Table <code>{conflict.entity.table}</code>; record <code>{conflict.entity.recordId}</code>{conflict.entity.field&&<>; field {shown(evidence.fieldLabel)} (<code>{conflict.entity.field}</code>)</>}.</p><p>Applied record version {shown(evidence.appliedRecordVersion)}; observed version {shown(evidence.observedRecordVersion)}. Effect <code>{conflict.effectId}</code>.</p>{conflict.protectedBy.length>0&&<ul>{conflict.protectedBy.map((cause,index)=>'redacted'in cause?<li key={index}>{cause.message}</li>:<li key={index}>Protected by record <code>{cause.cause.recordId}</code>{cause.cause.field&&<> field <code>{cause.cause.field}</code></>}{cause.cause.targetId&&<> referencing <code>{cause.cause.targetId}</code></>}.</li>)}</ul>}<details><summary>Applied and observed content evidence</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({expected:conflict.expected,observed:conflict.observed},null,2)}</pre></details></li>
  })}</ul></>}
  {report.terminal&&report.conflicts.length===0&&<p>No imported effects required preservation.</p>}
 </section>
}
