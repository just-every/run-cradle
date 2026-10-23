import {SheetsSource} from '../sheets-source'
import { useEffect, useRef, useState } from 'react'
import type { BasePreview, ImportIdentities, ImportOptions } from '../../../domains/records/base-transfer/contracts'
import type { ImportJob } from '../../../../vendor/base/modules/import-kit/src/types'
import { importMutation, storedJobUrl, uploadPreview, type ImportReview } from './api'
import { ImportMappingFile } from './mapping-file'
import { ImportCorrespondenceFile } from './correspondence-file'
import { ImportPreview } from './preview'
import { ImportSchemaReview } from './schema-review'
import { ImportJobProgress } from './job'
import './import.css'
export function BaseImporter({ initialJobId }: { initialJobId?: string }) {
  const [files, setFiles] = useState<File[]>([]), [name, setName] = useState('Imported base'), [sourceFormat,setSourceFormat]=useState<'csv'|'json'|'xlsx'|'sheets'>('csv')
  const [preview, setPreview] = useState<BasePreview | null>(null), [review, setReview] = useState<ImportReview | null>(null)
  const [acknowledged, setAcknowledged] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [jobId, setJobId] = useState(initialJobId), [resumeId, setResumeId] = useState('')
  const identities = useRef<ImportIdentities | undefined>(undefined)
  const [mappingFile,setMappingFile]=useState<File|undefined>(undefined)
  const [correspondence,setCorrespondence]=useState<File|undefined>(undefined)
  const [csvOptions,setCsvOptions]=useState<ImportOptions|null>(null)
  const fileInput=useRef<HTMLInputElement>(null),nameInput=useRef<HTMLInputElement>(null)
  // Native inputs can be edited after HTML arrives but before React attaches handlers.
  useEffect(()=>{
    if(fileInput.current?.files?.length)setFiles(Array.from(fileInput.current.files))
    if(nameInput.current)setName(nameInput.current.value)
  },[])

  async function recompute(options: ImportOptions) {
    if(options.correspondenceAcceptedFingerprint&&options.correspondenceAcceptedFingerprint===preview?.options.correspondenceAcceptedFingerprint){const {correspondenceAcceptedFingerprint:_,...changed}=options;options=changed}
    setBusy(true); setError(''); setAcknowledged(false); setReview(null)
    try { const next = await uploadPreview('preview', files, options, identities.current,undefined,correspondence,mappingFile); identities.current = next.identities; setPreview(next) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not preview these files.') }
    finally { setBusy(false) }
  }
  async function saveReview() {
    if (!preview || !acknowledged || busy || error) return
    setBusy(true); setError('')
    try { setReview(await uploadPreview<ImportReview>('review', files, preview.options, identities.current, { fingerprint: preview.fingerprint, acceptLoss: acknowledged },correspondence,mappingFile)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save the acknowledged review.'); setAcknowledged(false) }
    finally { setBusy(false) }
  }
  async function adopt() {
    if (!review || !acknowledged || busy) return
    setBusy(true); setError('')
    try {
      const job = await importMutation<ImportJob>('adopt', { reviewId: review.reviewId, fingerprint: review.fingerprint, physicalFingerprint: review.physicalFingerprint, acceptLoss: acknowledged })
      window.history.replaceState(null, '', storedJobUrl(job.id)); setJobId(job.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Schema adoption failed.') }
    finally { setBusy(false) }
  }
  return <div className="cr-base-import cr-stack"><header className="cr-page-header"><h1>Import a base</h1><a className="cr-button cr-button--quiet" href="/app/records/">Back to records</a></header>{jobId ? <ImportJobProgress key={jobId} jobId={jobId} /> : <><p>Upload 1–20 CSV files together, one .xlsx workbook (each sheet becomes a table), or one Cradle base JSON file. Each CSV filename becomes a table name you can change; the first column names each record. A Cradle JSON export keeps its tables, field types, records, saved views and forms.</p>{sourceFormat === 'csv' && <details className="cr-import-boundary"><summary>About CSV files from Airtable</summary><p>Export each table as CSV and upload the files together. This import has been checked with sample files based on Airtable’s documented format; it has not been tested with an export from a live Airtable account.</p></details>}{error && <p className="cr-error" role="alert">{error}</p>}{review ? <ImportSchemaReview review={review} busy={busy} onAdopt={() => void adopt()} onRevise={() => { setReview(null); setAcknowledged(false) }} /> : preview ? <><ImportPreview preview={preview} busy={busy} stale={!!error} acknowledged={acknowledged} onAcknowledge={setAcknowledged} onChange={options => void recompute(options)} onReview={() => void saveReview()} />{error && <p role="status">The displayed preview has not accepted the latest change. Correct it and recompute before saving a review.</p>}<button className="cr-button cr-button--quiet" disabled={busy} onClick={() => { setPreview(null); setAcknowledged(false); setCorrespondence(undefined); setMappingFile(undefined); setCsvOptions(null); setFiles([]); identities.current = undefined }}>Choose different files</button></> : <form className="cr-card cr-stack" onSubmit={e => { e.preventDefault(); if(sourceFormat==='csv'&&correspondence&&!csvOptions){setError('Load the accompanying import-options.json under CSV review choices before reviewing correspondence.');return}; if (files.length < 1 || files.length > 20) { setError(`File limit: 1–20 CSVs or one JSON; current ${files.length}. Choose one file per table.`); return }; void recompute({ ...(sourceFormat==='csv'?csvOptions??{}:{}),name }) }}><fieldset disabled={busy}><legend>Source format</legend><label className="cr-choice"><input type="radio" name="source-format" checked={sourceFormat==='csv'} onChange={()=>{setSourceFormat('csv');setCsvOptions(null);setCorrespondence(undefined);setMappingFile(undefined);setFiles([]);setName('Imported base');identities.current=undefined}} />CSV set</label><label className="cr-choice"><input type="radio" name="source-format" checked={sourceFormat==='json'} onChange={()=>{setSourceFormat('json');setCsvOptions(null);setCorrespondence(undefined);setMappingFile(undefined);setFiles([]);setName('');identities.current=undefined}} />Base JSON</label><label className="cr-choice"><input type="radio" name="source-format" checked={sourceFormat==='xlsx'} onChange={()=>{setSourceFormat('xlsx');setCsvOptions(null);setCorrespondence(undefined);setMappingFile(undefined);setFiles([]);setName('Imported workbook');identities.current=undefined}} />Excel workbook (.xlsx)</label><label className="cr-choice"><input type="radio" name="source-format" checked={sourceFormat==='sheets'} onChange={()=>{setSourceFormat('sheets');setFiles([]);setName('Imported Google Sheets');identities.current=undefined}} />Google Sheets</label></fieldset><label className="cr-field">Base name<input ref={nameInput} required={sourceFormat==='csv'} placeholder={sourceFormat==='json'?'Keep the name in the JSON file':undefined} maxLength={120} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>{sourceFormat==='sheets'?<SheetsSource disabled={busy} onLoad={source=>setFiles([new File([source.content],source.filename,{type:'application/json'})])} />:<label className="cr-field">{sourceFormat==='csv'?'CSV files':sourceFormat==='xlsx'?'Excel workbook':'Cradle base JSON file'}<input ref={fileInput} key={sourceFormat} type="file" accept={sourceFormat==='csv'?'.csv,text/csv':sourceFormat==='xlsx'?'.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'.json,application/json'} multiple={sourceFormat==='csv'} disabled={busy} onChange={e => { setFiles(Array.from(e.target.files ?? [])); setError(''); identities.current = undefined }} /></label>}{sourceFormat==='csv'&&<ImportMappingFile disabled={busy} onLoad={(options,file)=>{setMappingFile(file);setCsvOptions(options);setName(options.name);setError('');identities.current=undefined}} onError={setError} />}{sourceFormat==='csv'&&<ImportCorrespondenceFile disabled={busy} onLoad={file=>{setCorrespondence(file);setError('');identities.current=undefined}} />}<ul>{files.map((file, i) => <li key={i}>{file.name} · {file.size} bytes</li>)}</ul><button className="cr-button" disabled={busy || !files.length}>{busy ? 'Preparing preview…' : 'Preview import'}</button></form>}{!preview && !review && <form className="cr-card cr-stack" onSubmit={e => { e.preventDefault(); window.location.assign(storedJobUrl(resumeId.trim())) }}><h2>Resume a stored import</h2><label className="cr-field">Import job ID<input value={resumeId} onChange={e => setResumeId(e.target.value)} required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" /></label><button className="cr-button cr-button--quiet">Open stored import</button></form>}</>}</div>
}
