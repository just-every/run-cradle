import { splitManualQuoteSource } from '../../apps/repairs/manual-quote-source'
import { REPAIRS_APP_ID } from '../../apps/repairs/model'
import { useEffect } from 'react'
import type { Source, FileObject } from '../../domains/evidence/contracts'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { useResource } from '../shared/api'
import { ResourceState, Timestamp } from '../shared/presentation'
export function SourcePage({ sourceId, version, repairId }: { sourceId: string; version?: number; repairId?: string }) {
  const source = useResource<Source>(`/api/v1/sources/${sourceId}${version ? `?version=${version}` : ''}`)
  return <OperatorFeaturePage currentPath={repairId ? "/app/repairs" : "/app/records"} title=""><div className="cr-page">{repairId&&<p><a className="cr-link" href={`/app/repairs/${repairId}`}>← Repair</a></p>}<ResourceState resource={source.resource} operation="supporting source" retry={source.refresh}>{data => <><header className="cr-page-header"><div><p className="cr-eyebrow">{data.kind} · version {data.version}</p><h1>Supporting source</h1><p>Received <Timestamp value={data.receivedAt} /></p></div></header>{version && <p className="cr-notice">Viewing cited source version {version}. <a className="cr-link" href={`/app/evidence/${sourceId}${repairId ? `?repairId=${repairId}` : ''}`}>Review latest source</a></p>}{data.accessibleContentUrl && <SourceContent url={data.accessibleContentUrl} manualQuote={data.kind==='form'&&data.ownerAppId===REPAIRS_APP_ID} />}{data.fileIds.map(id => <FileSummary key={id} id={id} />)}<details className="cr-detail"><summary>Provenance and retention</summary><p>Known since <Timestamp value={data.knownAt} />. Effective {data.effectiveAt ? <Timestamp value={data.effectiveAt} /> : 'date not recorded'}.</p><p>Retained until explicitly deleted.</p><p>Source {data.id} · SHA-256 {data.sha256}</p></details></>}</ResourceState></div></OperatorFeaturePage>
}
function SourceContent({ url, manualQuote }: { url: string; manualQuote: boolean }) {
  const local = url.startsWith('/') && !url.startsWith('//')
  const content = useResource<{ text: string }>(local ? url : null)
  return local ? <ResourceState resource={content.resource} operation="source content" retry={content.refresh}>{data => <SourceText text={data.text} manualQuote={manualQuote} />}</ResourceState> : <p className="cr-error">The source content address is unavailable.</p>
}
export function SourceText({text,manualQuote}:{text:string;manualQuote:boolean}) {
  const quote = manualQuote ? splitManualQuoteSource(text) : null
  const style = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const
  return quote ? <><section className="cr-card"><h2>Original quote</h2><div style={style}>{quote.original}</div></section><details className="cr-detail"><summary>Recorded terms and technical details</summary><p>Reviewer-transcribed terms are preserved below with the complete captured source.</p><div style={style}>{text}</div></details></> : <div className="cr-card" style={style}>{text}</div>
}
export function FileSummary({ id, onReady }: { id: string; onReady?: (id: string, ready: boolean) => void }) {
  const file = useResource<FileObject>(`/api/v1/files/${id}`)
  const ready = file.resource.state === 'ready' && file.resource.data.state === 'available'
  useEffect(() => { onReady?.(id, ready) }, [id, ready])
  return <ResourceState resource={file.resource} operation="attachment" retry={file.refresh}>{data => <section className="cr-card"><h2>{data.filename}</h2><p>{data.mediaType} · {data.bytes.toLocaleString()} bytes · {data.state}</p>{data.state === 'available' ? <a className="cr-button cr-button--quiet" href={`/api/v1/files/${data.id}/content`}>Download file</a> : <p>{data.rejection || 'This file is not available for download.'}</p>}</section>}</ResourceState>
}
