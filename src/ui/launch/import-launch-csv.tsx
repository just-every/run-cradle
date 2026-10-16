import { useEffect, useMemo, useState } from 'react'
import { LAUNCH_APP_ID } from '../../apps/launch/contracts'
import { launchImportFields, launchImportKinds, launchImportLabels, type LaunchImportField, type LaunchImportKind } from '../../apps/launch/import-fields'
import type { FileObject } from '../../domains/evidence/contracts'
import { parseCsv } from '../../domains/portability/csv'
import { FileUpload } from '../evidence/file-upload'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, Timestamp } from '../shared/presentation'
import { sessionFetch } from '../shared/session-fetch'
import { LaunchImportRows } from './import-preview-rows'

type Preview = { id: string; token: string; state: 'valid' | 'invalid'; expiresAt: string; creates: number; updates: number; unchanged: number; errors: { row: number; message: string }[] }
type CustomField = { id: string; name: string }
const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Upload a campaign, deliverable or milestone CSV, map its columns, review every change,
 * then confirm the whole file in one transaction (IMPORT-001–005). */
export function ImportLaunchCsv({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
 const [kind, setKind] = useState<LaunchImportKind>('campaign'), [file, setFile] = useState<FileObject | null>(null), [headers, setHeaders] = useState<string[]>([])
 const [mapping, setMapping] = useState<Record<string, string>>({}), [error, setError] = useState(''), [confirmed, setConfirmed] = useState(false)
 const custom = useResource<{ items: CustomField[] }>(kind === 'campaign' ? '/api/v1/launch/custom-fields' : null)
 const preview = useCommand<Preview>(`launch-import-preview:${kind}`), commit = useCommand<{ id: string; rows: number }>(`launch-import-commit:${kind}`)
 const fields = useMemo<LaunchImportField[]>(() => [...launchImportFields[kind], ...(custom.resource.state === 'ready' ? custom.resource.data.items.map(field => ({ name: 'custom:' + field.id, label: field.name })) : [])], [kind, custom.resource])
 const label = (name: string) => fields.find(field => field.name === name)?.label ?? name
 const current = preview.result.state === 'committed' ? preview.result.value : null
 const busy = [preview.result.state, commit.result.state].some(state => ['submitting', 'pending', 'unknown'].includes(state))
 useEffect(() => { if (commit.result.state === 'committed') onImported() }, [commit.result.state])
 useEffect(() => { setMapping(Object.fromEntries(headers.map(header => [header, fields.find(field => [field.name, field.label].some(name => normal(name) === normal(header)))?.name ?? '']))) }, [headers, fields])
 async function uploaded(value: FileObject) {
  setError('')
  try { const response = await sessionFetch(`/api/v1/files/${value.id}/content`); if (!response.ok) throw new Error('The uploaded file could not be read.'); setHeaders(parseCsv(new Uint8Array(await response.arrayBuffer())).headers); setFile(value) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to read the CSV.') }
 }
 const restart = () => { setFile(null); setHeaders([]); setConfirmed(false); preview.reset(); commit.reset() }
 return <section className="cr-card cr-stack launch-import" aria-labelledby="launch-import-title">
  <header className="cr-page-header"><h2 id="launch-import-title">Import CSV</h2><button type="button" className="cr-button cr-button--quiet" onClick={onClose} disabled={busy}>Close import</button></header>
  {commit.result.state === 'committed' ? <div className="cr-notice cr-notice--committed" role="status"><p>Imported {commit.result.value.rows} rows from {file?.filename ?? 'the CSV'} in one transaction.</p><div className="cr-actions"><a className="cr-button cr-button--quiet" href={`/api/v1/launch/imports/${commit.result.value.id}/file`} download>Download stored file</a><button type="button" className="cr-button" onClick={restart}>Import another file</button></div></div> : <>
  <p>Campaign rows match by campaign code; deliverable and milestone rows match by campaign code and title. Empty cells never overwrite stored values. Nothing changes until you confirm the whole file.</p>
  {!file && <><fieldset className="launch-import-kinds" disabled={busy}><legend>What does this file contain?</legend>{launchImportKinds.map(value => <label className="cr-choice" key={value}><input type="radio" name="launch-import-kind" checked={kind === value} onChange={() => setKind(value)} />{launchImportLabels[value]}</label>)}</fieldset><FileUpload appId={LAUNCH_APP_ID} purpose="import" label="CSV file" onUploaded={value => void uploaded(value)} /></>}
  {file && !current && <form className="cr-form" onSubmit={event => { event.preventDefault(); void preview.submit('/api/v1/launch/imports/preview', { kind, fileId: file.id, mapping: Object.entries(mapping).filter(([, field]) => field).map(([column, field]) => ({ column, field })) }, []) }}>
   <p><strong>{file.filename}</strong> · {launchImportLabels[kind]} · {headers.length} columns</p>
   <fieldset className="launch-import-mapping" disabled={busy}><legend>Match columns to fields</legend>{headers.map(column => <label className="cr-field" key={column}>{column}<select value={mapping[column] ?? ''} onChange={event => setMapping(value => ({ ...value, [column]: event.target.value }))}><option value="">Skip column</option>{fields.map(field => <option key={field.name} value={field.name}>{field.label}{field.key ? ' (match key)' : ''}</option>)}</select></label>)}</fieldset>
   <div className="cr-actions"><button className="cr-button" disabled={busy || !Object.values(mapping).some(Boolean)}>Preview changes</button><button type="button" className="cr-button cr-button--quiet" onClick={restart} disabled={busy}>Choose another file</button></div>
  </form>}
  {current && <>
   <h3>Review changes</h3>
   <p className="launch-import-summary"><strong>{current.creates}</strong> new · <strong>{current.updates}</strong> updated · <strong>{current.unchanged}</strong> unchanged{current.errors.length ? <> · <strong>{current.errors.length}</strong> with errors</> : null}</p>
   {current.errors.length > 0 && <div className="cr-notice cr-notice--failed" role="alert"><p>Fix every row before importing; nothing has changed.</p><ul>{current.errors.map(problem => <li key={problem.row}>Row {problem.row}: {problem.message}</li>)}</ul></div>}
   <LaunchImportRows id={current.id} label={label} />
   <p>This preview expires <Timestamp value={current.expiresAt} />. A record changed after this preview makes the import ask for a new preview.</p>
   {current.state === 'valid' && <><label className="cr-choice"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Import every reviewed row. A committed import cannot be rolled back.</label>
    <div className="cr-actions"><button type="button" className="cr-button" disabled={!confirmed || busy} onClick={() => void commit.submit(`/api/v1/launch/imports/${current.id}/commit`, { token: current.token }, [])}>Import {current.creates + current.updates + current.unchanged} rows</button><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={() => { preview.reset(); setConfirmed(false) }}>Change mapping</button></div></>}
   {current.state !== 'valid' && <button type="button" className="cr-button cr-button--quiet" onClick={() => { preview.reset(); setConfirmed(false) }}>Change mapping</button>}
  </>}
  {preview.result.state !== 'committed' && <CommandFeedback {...preview} />}<CommandFeedback {...commit} />
  {error && <p role="alert" className="cr-error">{error}</p>}</>}
 </section>
}
