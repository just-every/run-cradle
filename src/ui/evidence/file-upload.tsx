import { useEffect, useRef, useState } from 'react'
import type { Ref } from '../../contracts/primitives'
import { directUploadBytes, directUploadLimit } from '../../domains/evidence/upload-limits'
import type { FileObject, Upload } from '../../domains/evidence/contracts'
import { readApi, useCommand } from '../shared/api'
import { sessionFetch } from '../shared/session-fetch'
import { CommandFeedback } from '../shared/presentation'
export function FileUpload({ appId, subject, fieldId, label, purpose = 'source', initialFile, onUploaded }: { appId: string; subject?: Ref; fieldId?: string; label?: string; purpose?: 'import' | 'source'; initialFile?: File; onUploaded: (file: FileObject) => void }) {
  const stage = useCommand<{ subject: Ref; uploadFieldIds: string[]; sourceFieldIds: string[] }>(`file-stage:${appId}:${purpose}:${fieldId ?? 'source'}`)
  const begin = useCommand<Upload>(`upload:${appId}:${subject?.recordId ?? 'draft'}:${fieldId ?? 'source'}`)
  const [file, setFile] = useState<File | null>(initialFile ?? null)
  const [state, setState] = useState<'idle' | 'uploading' | 'checking' | 'failed' | 'done'>('idle')
  const [error, setError] = useState('')
  const busy = useRef(false)
  async function upload() {
    if (!file || busy.current) return
    busy.current = true; setError(''); setState('uploading')
    try {
      if (file.size > directUploadBytes) throw new Error(`Direct uploads allow at most ${directUploadLimit}.`)
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('')
      const staging = subject ? null : stage.result.state === 'committed' ? stage.result.value : await stage.submit('/api/v1/commands/source.stage', { appId, purpose }, [])
      const uploadSubject = subject ?? staging?.subject
      if (!uploadSubject) { setState('idle'); return }
      const prepared = begin.result.state === 'committed' ? begin.result.value : await begin.submit('/api/v1/commands/upload.begin', { appId, filename: file.name, mediaType: file.type || 'application/octet-stream', bytes: file.size, sha256, subject: uploadSubject }, [])
      if (!prepared) { setState('idle'); return }
      if (prepared.file.sha256 !== sha256 || prepared.file.bytes !== file.size) throw new Error('Choose the original file to continue this upload.')
      if (!prepared.uploadUrl.startsWith('/') || prepared.uploadUrl.startsWith('//')) throw new Error('The upload destination is not a private workspace address.')
      if (Date.parse(prepared.expiresAt) <= Date.now()) throw new Error('This upload permission expired. Check the existing file before starting again.')
      try {
        const response = await sessionFetch(prepared.uploadUrl, { method: prepared.method, headers: prepared.headers, body: file })
        if (!response.ok) throw new Error(`Upload returned ${response.status}.`)
        await response.arrayBuffer()
      } catch { /* A missing response is resolved by the actual file status below. */ }
      setState('checking')
      const { data: stored } = await readApi<FileObject>(`/api/v1/files/${prepared.file.id}`)
      if (stored.state !== 'available') throw new Error(stored.rejection || (stored.state === 'uploading' ? 'The file has not arrived. You can retry this same upload.' : 'The file is still being checked. Check again before attaching it.'))
      setState('done'); onUploaded(stored)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The file could not be verified.'); setState('failed') }
    finally { busy.current = false }
  }
  useEffect(() => { if (initialFile) void upload() }, [initialFile])
  return <div className="cr-stack"><label className="cr-field">{label ?? 'Choose file'}<input id={fieldId ? `field-${fieldId}` : undefined} type="file" disabled={state === 'uploading' || state === 'checking' || state === 'done'} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>{file && <p>{file.name} · {file.size.toLocaleString()} bytes</p>}<button type="button" className="cr-button cr-button--quiet" disabled={!file || ['uploading', 'checking', 'done'].includes(state) || [begin.result.state, stage.result.state].some(value => ['pending', 'unknown', 'submitting'].includes(value))} onClick={() => void upload()}>{state === 'done' ? 'File verified' : state === 'uploading' ? 'Uploading…' : state === 'checking' ? 'Checking file…' : 'Upload file'}</button>{error && <p className="cr-error" role="alert">{error}</p>}{stage.result.state !== 'committed' && <CommandFeedback {...stage} />}<CommandFeedback {...begin} />{state === 'done' && <button type="button" className="cr-button cr-button--quiet" onClick={() => { begin.reset(); stage.reset(); setFile(null); setState('idle') }}>Add another file</button>}<p className="cr-muted">Files up to {directUploadLimit} stay private to the permitted record. Uploading does not submit the form.</p></div>
}
