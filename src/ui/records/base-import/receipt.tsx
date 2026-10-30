import type { MoveInReceipt } from '../../../domains/records/base-transfer/receipt'
import { useResource } from '../../shared/api'
import { ResourceState } from '../../shared/presentation'
import { importPrefix, storedJobUrl } from './api'
import './import.css'

const date=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})+' UTC'
const stateLine={applied:'Applied: every reviewed record and link was written and reconciled.',partial:'Partial: the job has not finished. What is not yet applied is listed by table.',undone:'Undone: imported records and links were reversed where unchanged. The base schema and source files remain.',failed:'Failed: the job stopped. Inspect the job report before continuing.'} as const
export function ImportReceipt({ jobId }: { jobId: string }) {
  const receipt = useResource<MoveInReceipt>(`${importPrefix}/jobs/${encodeURIComponent(jobId)}/receipt.json`)
  const base=`${importPrefix}/jobs/${encodeURIComponent(jobId)}`
  return <div className="cr-base-import cr-import-receipt cr-stack">
    <header className="cr-page-header"><h1>Move-in receipt</h1><div className="cr-actions cr-receipt-actions"><button type="button" className="cr-button" onClick={()=>window.print()}>Print receipt</button><a className="cr-button cr-button--quiet" href={`${base}/receipt.json?download=1`} download>Download receipt JSON</a><a className="cr-button cr-button--quiet" href={storedJobUrl(jobId)}>Back to import job</a></div></header>
    <ResourceState resource={receipt.resource} operation="move-in receipt" retry={receipt.refresh}>{data => <>
      <section className="cr-card cr-stack" aria-labelledby="receipt-summary"><h2 id="receipt-summary">{data.job.baseName}</h2>
        <p><strong>{stateLine[data.job.state as keyof typeof stateLine]??data.job.state}</strong></p>
        <p>State as of {date(data.job.stateAsOf)}. Review saved {date(data.job.reviewedAt)}. Job <code>{data.job.id}</code>.</p>
        <p>{data.source.statement}</p>
        <p>Reconciliation: {data.reconciliation.ok?'native readback matches the job':'native readback differs from the job'} ({data.reconciliation.missing} missing, {data.reconciliation.duplicate} duplicate, {data.reconciliation.extra} extra, {data.reconciliation.mismatched} mismatched).</p>
        {data.undo&&<p>Reversal: {data.undo.reversed} reversed, {data.undo.retained} kept as conflicts, {data.undo.remaining} remaining.</p>}
      </section>
      <section className="cr-stack" aria-labelledby="receipt-files"><h2 id="receipt-files">Source files</h2><ul>{data.source.files.map(file=><li key={file.name}><strong>{file.name}</strong> · {file.size} bytes · SHA-256 <code>{file.sha256}</code></li>)}</ul></section>
      <section className="cr-stack" aria-labelledby="receipt-tables"><h2 id="receipt-tables">Tables</h2>{data.tables.map(table=><article className="cr-card cr-stack" key={table.tableKey}>
        <h3>{table.label}</h3>
        <p>From {table.sourceFiles.join(', ')||'no rows'}: {table.rowsRead} rows read = {table.created} created + {table.rejected} rejected.</p>
        {table.notYetApplied&&<p className="cr-notice">Not yet applied: {table.notYetApplied.records} records and {table.notYetApplied.linkCells} link cells.</p>}
        {table.rejections.length>0&&<><h4>Rejected rows</h4><ul>{table.rejections.map(row=><li key={String(row.row)}>Row {row.row}{row.sourceLine!==undefined?` (line ${row.sourceLine})`:''} {row.primary&&<>· <q>{row.primary}</q></>}<ul>{row.reasons.map((reason,index)=><li key={index}>{reason.column?`${reason.column}: `:''}{reason.message}</li>)}</ul></li>)}</ul></>}
        {data.workbookFormulas?.some(f=>f.tableKey===table.tableKey)&&<><h4>Workbook formulas</h4><ul>{data.workbookFormulas.filter(f=>f.tableKey===table.tableKey).map(formula=><li key={formula.columnKey}>{formula.column}: {formula.recognized?`Reviewed native formula ${formula.nativeFormula}; ${formula.matchedRows} of ${formula.rowsRead} cached results match. Recomputes after input edits.`:`Not preserved: ${formula.reason}. Cached values remain in the reviewed scalar field, or original source if skipped.`}</li>)}</ul></>}
        {table.links.length>0&&<><h4>Links</h4><ul>{table.links.map(link=><li key={link.column}>{link.column}: {link.referencesRead} references · {link.resolved} resolved · {link.unresolved} unresolved · {link.ambiguous} ambiguous</li>)}</ul></>}
        {table.declaredColumns.length>0&&<><h4>Declared source columns</h4><ul>{table.declaredColumns.map(column=><li key={column.columnKey}>{column.column}: {column.declaredAs} ({column.declaredBy==='owner'?'declared by you':'recorded source type'}), imported as {column.importedAs} · {column.skipped} nonempty cells skipped · {column.converted} converted · {column.keptAsText} kept as text{column.attachmentManifest&&<> · <a className="cr-link" href={`${base}/attachment-manifest.csv?table=${encodeURIComponent(table.tableKey)}&column=${encodeURIComponent(column.columnKey)}`} download>Download attachment list for {column.column}</a></>}</li>)}</ul></>}
      </article>)}</section>
      <section className="cr-stack" aria-labelledby="receipt-stores"><h2 id="receipt-stores">Unresolved store references</h2><p>{data.storeReferences.length} references returned without a connection or thumbnail.</p><ul>{data.storeReferences.map((reference,index)=><li key={index}><strong>Unresolved</strong> · {reference.name} · {reference.type} · {reference.size??'Unknown'} bytes · {reference.provider}{reference.link&&<> · <a href={reference.link} target="_blank" rel="noopener noreferrer">Open in store</a></>}</li>)}</ul></section>
      <section className="cr-stack" aria-labelledby="receipt-not-carried"><h2 id="receipt-not-carried">Not carried by this import</h2><p>Mark one choice for each line.</p><ul className="cr-receipt-marks">{data.notCarried.map(line=><li key={line.id}><p>{line.statement}</p><p className="cr-muted">{line.choices.map(choice=>`☐ ${choice}`).join('   ')}</p></li>)}</ul></section>
      <section className="cr-stack" aria-labelledby="receipt-exits"><h2 id="receipt-exits">What each exit keeps</h2><ul>{data.exits.map(exit=><li key={exit.format}><strong>{exit.format}:</strong> {exit.preserves}</li>)}</ul><p>{data.roundTripNote}</p></section>
      <p className="cr-freshness">Produced {date(data.generatedAt)} from the retained job.</p>
    </>}</ResourceState>
  </div>
}
