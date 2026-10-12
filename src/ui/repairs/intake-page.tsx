import { LocalPhoto } from '../evidence/local-photo'
import { useEffect, useRef, useState } from 'react'
import type { CellValue } from '../../contracts/primitives'
import type { Intake } from '../../apps/repairs/contracts'
import type { FileObject, Source, Upload } from '../../domains/evidence/contracts'
import { REPAIRS_APP_ID, REPAIRS_FORM_ID } from '../../apps/repairs/model'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { readApi, useCommand, useResource } from '../shared/api'
import { sessionFetch } from '../shared/session-fetch'
import { discardLocalDraft, readLocalDraft, saveLocalDraft } from '../shared/local-draft'
import { CommandFeedback, ResourceState } from '../shared/presentation'
import type { IntakeContext } from '../../apps/repairs/contracts'
export function IntakePage() {
  const session = useResource<{ member: { id: string }; workspace: { id: string } }>('/api/v1/session')
  return <OperatorFeaturePage currentPath="/app/repairs" title=""><div className="cr-page cr-intake"><ResourceState resource={session.resource} operation="your signed-in identity" retry={session.refresh}>{data => <IntakeForm key={`${data.workspace.id}:${data.member.id}`} ownerId={`${data.workspace.id}:${data.member.id}`} />}</ResourceState></div></OperatorFeaturePage>
}
function IntakeForm({ ownerId }: { ownerId: string }) {
  const context = useResource<IntakeContext>('/api/v1/repairs/intake-context')
  const submit = useCommand<Intake>('repair-intake')
  const upload = useCommand<Upload>('repair-intake-photo')
  const capture = useCommand<Source>('repair-intake-source')
  const [text, setText] = useState(''), [file, setFile] = useState<File | null>(null), [storeId, setStoreId] = useState(''), [assetId, setAssetId] = useState('')
  const [online, setOnline] = useState(true), [retained, setRetained] = useState(false), [changed, setChanged] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState('')
  const busy = useRef(false), hydrated = useRef(false)
  const draftWrites = useRef<Promise<void>>(Promise.resolve())
  const draftGeneration = useRef(0)
  const draftId = `repair-intake:${ownerId}`
  useEffect(() => { let cancelled = false; void readLocalDraft(draftId, ownerId).then(draft => { if (cancelled) return; if (draft) { setText(draft.text); setFile(draft.files[0] ?? null); setStoreId(draft.storeId ?? ''); setAssetId(draft.assetId ?? ''); setRetained(true) } hydrated.current = true }, cause => setError(cause.message)); return () => { cancelled = true } }, [ownerId])
  useEffect(() => { const offline = () => { setOnline(false); setChanged(true) }; const reconnect = () => { setOnline(true); setChanged(true); context.refresh(); void submit.reconcile(); void upload.reconcile(); void capture.reconcile() }; setOnline(navigator.onLine); window.addEventListener('offline', offline); window.addEventListener('online', reconnect); return () => { window.removeEventListener('offline', offline); window.removeEventListener('online', reconnect) } }, [])
  useEffect(() => { if (!hydrated.current || submit.result.state === 'committed' || !text && !file) return; const generation = draftGeneration.current; const timer = setTimeout(() => { draftWrites.current = draftWrites.current.catch(() => {}).then(async () => { if (generation !== draftGeneration.current) return; await saveLocalDraft({ id: draftId, ownerId, appId: REPAIRS_APP_ID, formId: REPAIRS_FORM_ID, text, files: file ? [file] : [], storeId, assetId, updatedAt: new Date().toISOString(), commandId: 'commandId' in submit.result ? submit.result.commandId : null }); if (generation === draftGeneration.current) setRetained(true) }).catch(cause => { setRetained(false); setError(cause.message) }) }, 200); return () => clearTimeout(timer) }, [text, file, storeId, assetId, submit.result])
  function discardDraft() {
    draftGeneration.current++
    const discarded = draftWrites.current.catch(() => {}).then(() => discardLocalDraft(draftId, ownerId))
    draftWrites.current = discarded.catch(() => {})
    return discarded
  }
  useEffect(() => { if (submit.result.state === 'committed') void discardDraft().then(() => setRetained(false), cause => setError(cause.message)) }, [submit.result.state])
  useEffect(() => { if (submit.result.state === 'failed' && submit.result.error.detail.code === 'version_conflict') { context.refresh(); setChanged(true) } }, [submit.result])
  async function send(data: IntakeContext) {
    if (busy.current || !online) return
    busy.current = true; setWorking(true); setError('')
    try {
      const store = data.stores.find(item => item.ref.recordId === storeId) ?? (data.stores.length === 1 ? data.stores[0] : undefined)
      const assets = data.assets.filter(item => item.storeId === store?.ref.recordId)
      const asset = assets.find(item => item.ref.recordId === assetId) ?? (assets.length === 1 ? assets[0] : undefined)
      let source: Source | undefined
      let fileIds: string[] = []
      if (file) {
        if (!store) throw new Error('Choose the store before submitting a photo.')
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('')
        const prepared = upload.result.state === 'committed' ? upload.result.value : await upload.submit('/api/v1/commands/upload.begin', { appId: data.appId, subject: store.ref, filename: file.name, mediaType: file.type || 'application/octet-stream', bytes: file.size, sha256 }, [])
        if (!prepared) return
        if (prepared.file.sha256 !== sha256) throw new Error('This attempt belongs to the original photo. Keep that photo or discard the draft before starting a different report.')
        if (!prepared.uploadUrl.startsWith('/') || prepared.uploadUrl.startsWith('//')) throw new Error('The private upload address is unavailable.')
        try { await sessionFetch(prepared.uploadUrl, { method: 'PUT', headers: prepared.headers, body: file }) } catch { /* Read the original file status before any intake submission. */ }
        const { data: stored } = await readApi<FileObject>(`/api/v1/files/${prepared.file.id}`)
        if (stored.state !== 'available') throw new Error(stored.rejection || 'The photo is not yet verified. The report has not been submitted.')
        fileIds = [stored.id]
        source = capture.result.state === 'committed' ? capture.result.value : await capture.submit('/api/v1/commands/source.capture', { appId: data.appId, kind: 'form', fileIds, text, subject: store.ref }, [])
        if (!source) return
      }
      const values: Record<string, CellValue> = { [data.fieldIds.text]: text, ...(store ? { [data.fieldIds.store]: store.ref } : {}), ...(asset ? { [data.fieldIds.asset]: asset.ref } : {}) }
      await submit.submit('/api/v1/commands/intake.submit', { appId: data.appId, formId: data.formId, values, text, fileIds, ...(source ? { sourceId: source.id } : {}) }, [...(store ? [{ ref: store.ref, version: store.version }] : []), ...(asset ? [{ ref: asset.ref, version: asset.version }] : [])])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The report has not been confirmed.') } finally { busy.current = false; setWorking(false) }
  }
  if (submit.result.state === 'committed') return <section className="cr-card" role="status"><h1>{submit.result.value.state === 'duplicate' ? 'This report was already received' : 'Problem reported'}</h1><p>{submit.result.value.question?.text ?? 'Your report is saved. Current work and any necessary question will appear in Repairs.'}</p><a className="cr-button" href={`/app/repairs/intakes/${submit.result.value.id}`}>{submit.result.value.question ? 'Answer the necessary question' : 'Open report'}</a></section>
  const uncertain = [submit.result.state, upload.result.state, capture.result.state].some(state => ['submitting', 'pending', 'unknown'].includes(state))
  return <><header className="cr-page-header"><h1>Report a problem</h1></header><ResourceState resource={context.resource} operation="your repair details" retry={context.refresh}>{data => {
    const store = data.stores.find(item => item.ref.recordId === storeId) ?? (data.stores.length === 1 ? data.stores[0] : undefined)
    const assets = data.assets.filter(item => item.storeId === store?.ref.recordId)
    return <form className="cr-form" onSubmit={event => { event.preventDefault(); void send(data) }}>{data.stores.length === 1 ? <p className="cr-eyebrow">{data.stores[0]!.name}</p> : <label className="cr-field">Store<select disabled={uncertain || working || upload.result.state === 'committed'} value={storeId} onChange={event => { setStoreId(event.target.value); setAssetId('') }}><option value="">Choose store if known</option>{data.stores.map(item => <option key={item.ref.recordId} value={item.ref.recordId}>{item.name}</option>)}</select></label>}{assets.length === 1 ? <p>{assets[0]!.name}</p> : assets.length > 1 && <label className="cr-field">Which asset? <select disabled={uncertain || working} value={assetId} onChange={event => setAssetId(event.target.value)}><option value="">Not sure yet</option>{assets.map(item => <option key={item.ref.recordId} value={item.ref.recordId}>{item.name}{item.serial ? ` · ${item.serial}` : ''}</option>)}</select></label>}<label className="cr-field">Describe the problem<textarea required value={text} disabled={uncertain || working} onChange={event => { if (capture.result.state === 'committed') capture.reset(); setText(event.target.value) }} /></label><label className="cr-field">Photo (optional)<input type="file" accept="image/*" disabled={uncertain || working || upload.result.state === 'committed'} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>{file && <LocalPhoto file={file} />}{file && <p>{file.name} <button type="button" className="cr-button cr-button--quiet" disabled={uncertain || working || upload.result.state === 'committed'} onClick={() => setFile(null)}>Remove photo</button></p>}{retained && <p className="cr-notice">Local draft — not submitted. Retained on this device until you submit or discard it.</p>}{!online && <p className="cr-notice">You’re offline. Your report will not be submitted automatically.</p>}{online && changed && <p className="cr-notice">Current details have been checked. Review your report and submit when ready.</p>}{error && <p className="cr-error" role="alert">{error}</p>}{upload.result.state !== 'committed' && <CommandFeedback {...upload} />}{capture.result.state !== 'committed' && <CommandFeedback {...capture} />}<CommandFeedback {...submit} /><button className="cr-button" disabled={!online || !text.trim() || working || uncertain}>{working ? 'Submitting…' : 'Submit problem'}</button><button className="cr-button cr-button--quiet" type="button" disabled={working || uncertain} onClick={() => { void discardDraft().then(() => { setText(''); setFile(null); setRetained(false); upload.reset(); capture.reset(); submit.reset() }, cause => setError(cause.message)) }}>Discard local draft</button></form>
  }}</ResourceState></>
}
