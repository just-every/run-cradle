import { useEffect, useState } from 'react'
import type { SourceIntakeResult } from '../../domains/construction/contracts'
import type { FileObject, Source } from '../../domains/evidence/contracts'
import { FileUpload } from '../evidence/file-upload'
import { useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'
export function UploadSource({ onAdded }: { onAdded: (source: Source) => void }) {
  const intake = useCommand<SourceIntakeResult>('new-operation-source-intake')
  const capture = useCommand<Source>('new-operation-source-capture')
  const [chosen, setChosen] = useState<File | undefined>()
  const [file, setFile] = useState<FileObject | null>(null)
  useEffect(() => { if (capture.result.state === 'committed') onAdded(capture.result.value) }, [capture.result.state])
  async function captureFile(value: FileObject) {
    if (intake.result.state !== 'committed') return
    setFile(value)
    await capture.submit('/api/v1/commands/source.capture', { appId: intake.result.value.subject.ref.appId, kind: 'file', fileIds: [value.id], subject: intake.result.value.subject.ref }, [])
  }
  return <details className="cr-detail"><summary>Add a private source file</summary>{intake.result.state !== 'committed' ? <label className="cr-field">Source file<input type="file" disabled={!['idle', 'failed'].includes(intake.result.state)} onChange={event => { const selected = event.target.files?.[0]; if (selected) { setChosen(selected); void intake.submit('/api/v1/commands/source.intake.prepare', {}, []) } }} /></label> : <FileUpload initialFile={chosen} appId={intake.result.value.subject.ref.appId} subject={intake.result.value.subject.ref} fieldId={intake.result.value.fieldIds[0]} label="Source file" onUploaded={value => void captureFile(value)} />}{intake.result.state !== 'committed' && <CommandFeedback {...intake} />}<CommandFeedback {...capture} />{file && capture.result.state === 'failed' && <button type="button" className="cr-button cr-button--quiet" onClick={() => void captureFile(file)}>Save uploaded source</button>}{capture.result.state === 'committed' && <p><a className="cr-link" href={`/app/evidence/${capture.result.value.id}`} target="_blank" rel="noopener noreferrer">Review {file?.filename ?? 'uploaded source'} ↗</a> · Included in this proposal.</p>}</details>
}
