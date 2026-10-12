import { useState } from 'react'
import { PrepareMandate } from './mandate-page'
import type { Page } from '../../contracts/primitives'
import type { Case, Mandate } from '../../domains/operations'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { useResource } from '../shared/api'
import { Empty, ResourceState, Timestamp } from '../shared/presentation'
export function OperationsPage({ appId }: { appId?: string }) {
  const apps = useResource<Page<{ id: string; name: string }>>('/api/v1/apps')
  return <OperatorFeaturePage currentPath="/app/operations" title=""><div className="cr-page"><header className="cr-page-header"><h1>Operations</h1><a className="cr-button" href="/app/operations/studio">Add operation</a></header><ResourceState resource={apps.resource} operation="applications" retry={apps.refresh}>{page => <><nav className="cr-actions" aria-label="Operations by application"><a className="cr-button cr-button--quiet" href="/app/operations" aria-current={!appId ? 'page' : undefined}>All operations</a>{page.items.map(app => <a className="cr-button cr-button--quiet" href={`/app/operations?appId=${app.id}`} key={app.id} aria-current={app.id === appId ? 'page' : undefined}>{app.name}</a>)}</nav><AppOperations key={appId ?? 'all'} appId={appId} /></>}</ResourceState></div></OperatorFeaturePage>
}
function AppOperations({ appId }: { appId?: string }) {
  const [preparing, setPreparing] = useState(false)
  const cases = useResource<Page<Case>>(`/api/v1/cases${appId ? `?appId=${appId}` : ''}`)
  const mandates = useResource<Page<Mandate>>(`/api/v1/mandates${appId ? `?appId=${appId}` : ''}`)
  if (preparing && appId) return <PrepareMandate appId={appId} onClose={() => setPreparing(false)} />
  return <>{appId && <button className="cr-button cr-button--quiet" onClick={() => setPreparing(true)}>Prepare operating instructions</button>}<section className="cr-section"><h2>Current work</h2><ResourceState resource={cases.resource} operation="current work" retry={cases.refresh}>{page => page.items.length ? <div className="cr-stack">{page.items.map(value => <article className="cr-card" key={value.id}><p className="cr-eyebrow">{value.state.replaceAll('_', ' ')}</p><h3><a href={`/app/cases/${value.id}`}>{value.objective}</a></h3><p>{value.nextStep}</p>{value.stopReason && <p className="cr-notice">{value.stopReason}</p>}{value.nextWakeAt && <p>Next check <Timestamp value={value.nextWakeAt} /></p>}</article>)}</div> : <Empty title="No current work">Work appears here after an operation is activated under its explicit authority.</Empty>}</ResourceState></section><section className="cr-section"><h2>Operating instructions</h2><ResourceState resource={mandates.resource} operation="operating instructions" retry={mandates.refresh}>{page => page.items.length ? <div className="cr-stack">{page.items.map(value => <article className="cr-card" key={value.id}><p className="cr-eyebrow">{value.state}</p><h3>{value.objective}</h3><p>{value.impact.summary}</p><a className="cr-link" href={`/app/operations/mandates/${value.id}`}>Review instructions and authority →</a></article>)}</div> : <Empty title="No operating instructions yet">Prepare an outcome and business limits before work is delegated.</Empty>}</ResourceState></section></>
}
