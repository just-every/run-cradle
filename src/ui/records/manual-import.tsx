import {CSV_CREATE_ALL} from '../../domains/records/csv-mapping-contracts'
import {SheetsSource,type SheetsCapture} from './sheets-source'
import {encodeCsv} from '../../domains/portability/csv'
import { useEffect, useState } from 'react'
import type { EntitySchema } from '../../domains/records/contracts'
import type { CsvImportPreview, CsvImportSummary } from '../../domains/records/csv-import-contracts'
import { parseCsv } from '../../domains/portability/csv'
import { readApi, useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'
import { ManualImportPreview } from './manual-import-preview'
import { ManualImportMappings } from './manual-import-mappings'

export function ManualImport({ schema, onClose, onSaved }: {
  schema: EntitySchema; onClose: () => void; onSaved: (summary: CsvImportSummary) => void
}) {
  const [workbook,setWorkbook]=useState<{filename:string;base64:string;sheet:string}|null>(null),[sheets,setSheets]=useState<{name:string;headers:string[]}[]>([])
  const [sheetSource,setSheetSource]=useState<SheetsCapture|null>(null),[sheetName,setSheetName]=useState(''),[scheduleMessage,setScheduleMessage]=useState('')
  function useSheet(source:SheetsCapture,name:string){const sheet=source.sheets.find(s=>s.name===name)!;setSheetSource(source);setSheetName(name);setWorkbook(null);setCsv(encodeCsv(sheet.headers,sheet.rows.map(row=>row.map(cell=>cell.value===null?'':String(cell.value)))));setHeaders(sheet.headers);setMapping({});setMerge('');setPreview(null)}
  async function schedule(enabled:boolean){setBusy(true);setError('');try{await readApi('/api/v1/records/sheets-schedule',{method:'POST',body:JSON.stringify({appId:schema.appId,entityId:schema.id,connectionId:sheetSource!.connectionId,sheet:sheetName,mapping:Object.entries(mapping).filter(([,id])=>id).map(([column,fieldId])=>({column,fieldId})),mergeFieldId:merge,enabled})});setScheduleMessage(enabled?'Hourly merge enabled. It pauses if owner rights, consent or mapping become unavailable.':'Hourly merge paused.')}catch(e){setError(e instanceof Error?e.message:'Schedule could not be saved.')}finally{setBusy(false)}}
  const [csv, setCsv] = useState(''), [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({}), [merge, setMerge] = useState('')
  const [preview, setPreview] = useState<CsvImportPreview | null>(null), [error, setError] = useState('')
  const [busy, setBusy] = useState(false), [mappingBusy,setMappingBusy] = useState(false), [confirmed, setConfirmed] = useState(false)
  const command = useCommand<CsvImportSummary>(`manual-import:${schema.appId}:${schema.id}`)
  const fields = schema.fields.filter(field => !field.readOnly && field.type !== 'computed')
  const committing = ['submitting', 'pending', 'unknown'].includes(command.result.state)
  useEffect(() => {
    if (command.result.state === 'committed') onSaved(command.result.value)
  }, [command.result.state])

  async function load(file: File) {
    setBusy(true); setError(''); setSheetSource(null);setScheduleMessage(''); setWorkbook(null);setSheets([]); setCsv(''); setHeaders([]); setMerge(''); setMapping({}); setPreview(null); setConfirmed(false)
    try {
      if(file.size>10485760)throw new Error('Import fileBytes limit 10485760 exceeded. Split the workbook.')
      const bytes = new Uint8Array(await file.arrayBuffer())
      if(/\.xls[xm]$/i.test(file.name)){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));const base64=btoa(binary),choices=(await readApi<{name:string;headers:string[]}[]>('/api/v1/records/workbook-sheets',{method:'POST',body:JSON.stringify({filename:file.name,base64})})).data;setSheets(choices);setWorkbook({filename:file.name,base64,sheet:choices[0]!.name});setHeaders(choices[0]!.headers);setMapping(Object.fromEntries(choices[0]!.headers.map(header=>[header,fields.find(field=>field.label===header)?.id??''])));return}
      const parsed = parseCsv(bytes)
      setCsv(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); setHeaders(parsed.headers)
      setMapping(Object.fromEntries(parsed.headers.map(header => [header, fields.find(field => field.label === header)?.id ?? ''])))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read CSV.') }
    finally { setBusy(false) }
  }
  async function prepare() {
    setBusy(true); setError('')
    try {
      setPreview((await readApi<CsvImportPreview>('/api/v1/records/import-preview', { method: 'POST', body: JSON.stringify({
        appId: schema.appId, entityId: schema.id, ...(workbook?{workbook}:{csv}),
        mapping: Object.entries(mapping).filter(([, id]) => id).map(([column, fieldId]) => ({ column, fieldId })), mergeFieldId: merge,
      }) })).data)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Import preview failed.') }
    finally { setBusy(false) }
  }
  return <section className="cr-card cr-stack">
    <header className="cr-page-header"><h2>Import {schema.label}</h2><button className="cr-button cr-button--quiet" disabled={busy || mappingBusy || committing} onClick={onClose}>Close import</button></header>
    <p>Choose how to import rows, then review what will change. Valid rows can be imported while rejected rows wait for correction.</p>
    {!preview ? <form className="cr-form" onSubmit={event => { event.preventDefault(); void prepare() }}>
      <fieldset disabled={busy || mappingBusy}><legend>Match columns</legend>
        <label className="cr-field">CSV or Excel file<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => { if (event.target.files?.[0]) void load(event.target.files[0]) }} /></label>
        <SheetsSource disabled={busy||mappingBusy} onLoad={source=>useSheet(source,source.sheets[0]!.name)} />
        {sheetSource&&<label className="cr-field">Google worksheet<select value={sheetName} onChange={event=>useSheet(sheetSource,event.target.value)}>{sheetSource.sheets.map(s=><option key={s.name}>{s.name}</option>)}</select></label>}
        {workbook&&<label className="cr-field">Worksheet<select value={workbook.sheet} onChange={event=>{const sheet=sheets.find(s=>s.name===event.target.value)!;setWorkbook({...workbook,sheet:sheet.name});setHeaders(sheet.headers);setMapping({});setMerge('')}}>{sheets.map(sheet=><option key={sheet.name}>{sheet.name}</option>)}</select></label>}
        <ManualImportMappings schema={schema} headers={headers} mapping={mapping} merge={merge} disabled={busy} onBusyChange={setMappingBusy} onUse={(saved,mergeField)=>{if(sheetSource&&mergeField===CSV_CREATE_ALL){setError('Create all rows is available for CSV and Excel files. Choose a matching field for Google Sheets.');return}setMapping(saved);setMerge(mergeField)}} />
        {headers.map(header => <label className="cr-field" key={header}>{header}<select value={mapping[header] ?? ''} onChange={event => setMapping({ ...mapping, [header]: event.target.value })}>
          <option value="">Skip column</option>{fields.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}
        </select></label>)}
        <label className="cr-field">Match existing records by<select required value={merge} onChange={event => setMerge(event.target.value)}>
          <option value="">Choose how to import</option>{!sheetSource && <option value={CSV_CREATE_ALL}>Create all rows</option>}{headers.includes('_record_id') && <option value="_record_id">Original record ID (recovery only)</option>}
          {fields.filter(field => Object.values(mapping).includes(field.id) && ['text', 'number', 'date', 'select'].includes(field.type)).map(field => <option key={field.id} value={field.id}>{field.label}</option>)}
        </select></label>
      </fieldset>
      <button className="cr-button" disabled={(!csv&&!workbook) || !merge || busy || mappingBusy}>Preview import</button>
    </form> : <>
      <h3>Review import</h3>{sheetSource&&<div className="cr-actions"><button type="button" className="cr-button" disabled={busy||committing||!confirmed} onClick={()=>void schedule(true)}>Enable hourly merge</button><button type="button" className="cr-button cr-button--quiet" disabled={busy||committing} onClick={()=>void schedule(false)}>Pause hourly merge</button></div>}{scheduleMessage&&<p role="status">{scheduleMessage}</p>}
      <p>{preview.creates} new · {preview.updates} updated · {preview.unchanged} unchanged · {preview.rejected} rejected</p>
      <ManualImportPreview key={preview.id} schema={schema} preview={preview} />
      {preview.rejected > 0 && <p>Rejected rows will be skipped. Correct them in your CSV and preview again to include them.</p>}
      {preview.rows.length > 0 ? <>
        <label className="cr-choice"><input type="checkbox" disabled={committing} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Import these reviewed changes</label>
        <button className="cr-button" disabled={!confirmed || !['idle', 'failed'].includes(command.result.state)} onClick={() => void command.submit('/api/v1/commands/records.import-commit', { previewId: preview.id }, [])}>Import records</button>
      </> : <p role="alert" className="cr-error">No valid rows to import. Correct the rejected rows and preview again.</p>}
      <button className="cr-button cr-button--quiet" disabled={committing} onClick={() => { setPreview(null); setConfirmed(false); command.reset() }}>Change import</button>
      <CommandFeedback {...command} />
    </>}
    {error && <p role="alert" className="cr-error">{error}</p>}
  </section>
}
