import { useEffect, useState } from 'react'
import type { ImportStatus } from '../../../domains/records/base-transfer/contracts'
import { readApi } from '../../shared/api'
import { importMutation, importPrefix, storedJobUrl, receiptUrl, continuingImportOperation, importProgressKey } from './api'
import { ImportReportDetails } from './diagnostics'
import { ImportUndoReport } from './undo-report'
const continuing = new Set(['queued', 'applying', 'undoing', 'rolling_back'])
export function ImportJobProgress({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<ImportStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [reverse, setReverse] = useState<'undo' | 'rollback' | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    async function advance() {
      setBusy(true); setError('')
      try {
        let current = (await readApi<ImportStatus>(`${importPrefix}/jobs/${encodeURIComponent(jobId)}`, undefined, abort.signal)).data
        if (abort.signal.aborted) return
        setStatus(current)
        while (!current.restoreHeld && continuing.has(current.job.state) && !abort.signal.aborted) {
          const previous = importProgressKey(current)
          await readApi(`${importPrefix}/jobs/${encodeURIComponent(jobId)}/${continuingImportOperation(current)}`, { method: 'POST', body: '{}' }, abort.signal)
          current = (await readApi<ImportStatus>(`${importPrefix}/jobs/${encodeURIComponent(jobId)}`, undefined, abort.signal)).data
          if (!abort.signal.aborted) setStatus(current)
          if (continuing.has(current.job.state) && importProgressKey(current) === previous) throw new Error('The bounded batch returned no durable progress. Inspect the report and retry explicitly.')
        }
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Could not advance the stored import.') }
      finally { if (!abort.signal.aborted) setBusy(false) }
    }
    void advance()
    return () => abort.abort()
  }, [jobId, revision])
  async function action(operation: 'resume' | 'undo' | 'rollback') {
    setBusy(true); setError('')
    try { await importMutation(`jobs/${encodeURIComponent(jobId)}/${operation}`); setReverse(null); setRevision(value => value + 1) }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Import action failed.')
      try { setStatus((await readApi<ImportStatus>(`${importPrefix}/jobs/${encodeURIComponent(jobId)}`)).data) }
      catch (readError) { setStatus(null); setError(readError instanceof Error ? readError.message : 'Could not read the current stored job.') }
      setBusy(false)
    }
  }
  return <section className="cr-stack" style={{minWidth:0,overflowWrap:'anywhere'}}><h2>Stored import progress</h2><p><a className="cr-link" href={storedJobUrl(jobId)}>Stored job URL</a> · <code>{jobId}</code></p><p>Reload or reopen this URL to resume with your current sign-in. No re-upload or mapping is needed. Work advances in bounded batches. Required records and their links reverse together.</p>{error && <p className="cr-error" role="alert">{error}</p>}{!status && <p role="status">{busy ? 'Reading stored job…' : 'Job could not be read.'}</p>}{status && <><div className="cr-card cr-stack" aria-live="polite"><h3>Import {status.job.state}</h3>{status.restoreHeld && <p>This restored import is paused. Review its report before explicitly continuing it.</p>}<p>{status.job.checkpoint} of {status.job.total} forward entries processed.</p>{!status.reversal && <progress value={status.job.checkpoint} max={Math.max(1, status.job.total)} aria-label="Import entries processed" />}{status.progress && <p>Records: {status.progress.appliedRecords} / {status.progress.plannedRecords} · link cells: {status.progress.appliedLinkCells} / {status.progress.plannedLinkCells}.</p>}{status.job.error && <p className="cr-error" role="alert">{status.job.error}</p>}<p>Reconciliation: {status.reconciliation.ok ? 'matches the stored plan' : 'differences require attention'}.</p>{(['missing', 'duplicate', 'extra', 'mismatched'] as const).map(key => <section key={key}><h4>{key}: {status.reconciliation[key].length}</h4>{status.reconciliation[key].length > 0 && <ul>{status.reconciliation[key].map((value, i) => <li key={i}>{value}</li>)}</ul>}</section>)}</div>{status.reversal && <ImportUndoReport report={status.reversal} />}<p>Undo removes created records and links, preserves edited conflicting records, and keeps the base schema and original uploads. The report remains marked undone after reversal.</p><p>For base JSON, undo also removes the saved views and forms created by this import when they still match. Edited views and forms remain as reported conflicts.</p><div className="cr-actions">{status.restoreHeld && continuing.has(status.job.state) && <button className="cr-button" disabled={busy} onClick={() => void action(continuingImportOperation(status))}>Continue restored import</button>}<a className="cr-button cr-button--quiet" href={`${importPrefix}/jobs/${encodeURIComponent(jobId)}/report.json`} download>Download complete import report</a><a className="cr-button cr-button--quiet" href={receiptUrl(jobId)}>Open move-in receipt</a>{status.job.state === 'completed' && <><a className="cr-button" href={`/app/records/${status.job.destination}`}>Open imported base</a><button className="cr-button cr-button--quiet" disabled={busy} onClick={() => setReverse('undo')}>Undo import</button></>}{(status.job.state === 'failed' || error) && <><button className="cr-button" disabled={busy} onClick={() => void action(continuingImportOperation(status))}>Retry one batch</button>{['queued','applying','failed'].includes(status.job.state) && <button className="cr-button cr-button--quiet" disabled={busy} onClick={() => setReverse('rollback')}>Roll back partial import</button>}</>}{!busy && error && <button className="cr-button cr-button--quiet" onClick={() => setRevision(value => value + 1)}>Read stored status again</button>}</div>{reverse && <section className="cr-card"><h3>Confirm {reverse === 'undo' ? 'undo' : 'partial rollback'}</h3><p>Created records and links will be removed where they still match this import. Edited conflicts, the schema and exact original uploads remain.</p><div className="cr-actions"><button className="cr-button" disabled={busy} onClick={() => void action(reverse)}>Confirm {reverse === 'undo' ? 'undo' : 'rollback'}</button><button className="cr-button cr-button--quiet" disabled={busy} onClick={() => setReverse(null)}>Cancel reversal</button></div></section>}<details className="cr-detail"><summary>Complete stored mapping report</summary><ImportReportDetails tables report={status.report} /></details></>}{!status && error && <button className="cr-button" disabled={busy} onClick={() => setRevision(value => value + 1)}>Read stored job again</button>}</section>
}
