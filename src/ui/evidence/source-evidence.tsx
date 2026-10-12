import { useEffect, useState } from 'react'
import type { Source } from '../../domains/evidence/contracts'
import { useResource } from '../shared/api'
import { ResourceState, Timestamp } from '../shared/presentation'
import { FileSummary } from './source-page'
export function SourceEvidence({ id, version, onReady }: { id: string; version: number; onReady?: (id: string, ready: boolean) => void }) {
  const [files, setFiles] = useState<Record<string, boolean>>({})
  const source = useResource<Source>(`/api/v1/sources/${id}`)
  const content = useResource<{ text: string }>(`/api/v1/sources/${id}/content`)
  const ready = source.resource.state === 'ready' && source.resource.data.version === version && content.resource.state === 'ready' && source.resource.data.fileIds.every(id => files[id])
  useEffect(() => { onReady?.(id, ready) }, [id, ready])
  return <ResourceState resource={source.resource} operation="claim evidence" retry={source.refresh}>{data => <section className="cr-card"><p>Source version {version} · received <Timestamp value={data.receivedAt} /></p>{data.version !== version && <p className="cr-error">This source changed. Review a fresh completion claim before accepting.</p>}<ResourceState resource={content.resource} operation="source contents" retry={content.refresh}>{data => data.text ? <p style={{ whiteSpace: 'pre-wrap' }}>{data.text}</p> : <p>Evidence is in the attached file.</p>}</ResourceState>{data.fileIds.map(fileId => <FileSummary key={fileId} id={fileId} onReady={(id, ready) => setFiles(current => ({ ...current, [id]: ready }))} />)}</section>}</ResourceState>
}
