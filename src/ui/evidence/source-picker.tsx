import { useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { Source } from '../../domains/evidence/contracts'
import { useResource } from '../shared/api'
import { Empty, ResourceState, Timestamp } from '../shared/presentation'
export function SourcePicker({ selected, onChange, appId }: { selected: string[]; onChange: (ids: string[]) => void; appId?: string }) {
  const apps = useResource<Page<{ id: string; name: string }>>(appId ? null : '/api/v1/apps')
  if (appId) return <AppSources appId={appId} selected={selected} onChange={onChange} />
  return <ResourceState resource={apps.resource} operation="permitted source applications" retry={apps.refresh}>{page => page.items.length ? <div className="cr-stack">{page.items.map(app => <details className="cr-detail" key={app.id}><summary>{app.name}</summary><AppSources appId={app.id} selected={selected} onChange={onChange} /></details>)}</div> : <Empty title="No existing source applications">Describe the outcome first. Preparation will make missing sources explicit.</Empty>}</ResourceState>
}
function AppSources({ appId, selected, onChange }: { appId: string; selected: string[]; onChange: (ids: string[]) => void }) {
  const [cursor, setCursor] = useState<string>()
  const sources = useResource<Page<Source>>(`/api/v1/sources?appId=${appId}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
  return <ResourceState resource={sources.resource} operation="permitted sources" retry={sources.refresh}>{page => <>{page.items.length ? page.items.map(source => <div key={source.id} className="cr-choice"><label><input type="checkbox" checked={selected.includes(source.id)} onChange={event => onChange(event.target.checked ? [...selected, source.id] : selected.filter(id => id !== source.id))} />{source.kind} · <Timestamp value={source.receivedAt} /> · version {source.version}</label><a className="cr-link" href={`/app/evidence/${source.id}`} target="_blank" rel="noopener noreferrer">Review source</a></div>) : <p>No permitted sources are available in this application.</p>}<div className="cr-actions">{cursor && <button type="button" className="cr-button cr-button--quiet" onClick={() => setCursor(undefined)}>First page</button>}{page.nextCursor && <button type="button" className="cr-button cr-button--quiet" onClick={() => setCursor(page.nextCursor!)}>More sources</button>}</div></>}</ResourceState>
}
