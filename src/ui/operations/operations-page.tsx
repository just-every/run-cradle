import { useState } from 'react'
import { PrepareMandate } from './mandate-page'
import type { Page } from '../../contracts/primitives'
import type { Case, Mandate } from '../../domains/operations'
import { constructionNeedsText, type ConstructionReadiness } from '../../domains/construction/contracts'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { useResource } from '../shared/api'
import { Empty, ResourceState, Timestamp } from '../shared/presentation'
type App = { id: string; name: string }
export function OperationsPage({ appId }: { appId?: string }) {
  const apps = useResource<Page<App>>('/api/v1/apps')
  const readiness = useResource<ConstructionReadiness>('/api/v1/construction/readiness')
  const ready = readiness.resource.state === 'ready' && readiness.resource.data.ready
  return <OperatorFeaturePage currentPath="/app/operations" title=""><div className="cr-page"><header className="cr-page-header"><h1>Operations</h1>{ready && <a className="cr-button" href="/app/operations/studio">Add operation</a>}</header><ResourceState resource={apps.resource} operation="applications" retry={apps.refresh}>{page => <ResourceState resource={readiness.resource} operation="App studio" retry={readiness.refresh}>{studio => <AppOperations key={appId ?? 'all'} apps={page.items} appId={appId} studio={studio} />}</ResourceState>}</ResourceState></div></OperatorFeaturePage>
}
function AppOperations({ apps, appId, studio }: { apps: App[]; appId?: string; studio: ConstructionReadiness }) {
  const [preparing, setPreparing] = useState(false)
  const cases = useResource<Page<Case>>(`/api/v1/cases${appId ? `?appId=${appId}` : ''}`)
  const mandates = useResource<Page<Mandate>>(`/api/v1/mandates${appId ? `?appId=${appId}` : ''}`)
  if (preparing && appId) return <PrepareMandate appId={appId} onClose={() => setPreparing(false)} />
  const prepare = appId && studio.ready ? <button className="cr-button" onClick={() => setPreparing(true)}>Prepare operating instructions</button> : null
  return <ResourceState resource={cases.resource} operation="current work" retry={cases.refresh}>{work => <ResourceState resource={mandates.resource} operation="operating instructions" retry={mandates.refresh}>{instructions => !work.items.length && !instructions.items.length
    ? studio.ready
      ? <Empty title="No operations yet" headingLevel={2} action={prepare ?? <a className="cr-button" href="/app/operations/studio">Add operation</a>}>Cradle lists the work it handles for you here.</Empty>
      : <section className="cr-state" aria-live="polite"><h2>No operations yet</h2><p>Operations start in App studio, which needs {constructionNeedsText(studio.missing)}.</p><div className="cr-actions"><a className="cr-button" href="/app/automations">Set up an automation</a></div></section>
    : <><nav className="cr-actions" aria-label="Operations by application"><a className="cr-button cr-button--quiet" href="/app/operations" aria-current={!appId ? 'page' : undefined}>All operations</a>{apps.map(app => <a className="cr-button cr-button--quiet" href={`/app/operations?appId=${app.id}`} key={app.id} aria-current={app.id === appId ? 'page' : undefined}>{app.name}</a>)}</nav>{prepare}
      <section className="cr-section"><h2>Current work</h2>{work.items.length ? <div className="cr-stack">{work.items.map(value => <article className="cr-card" key={value.id}><p className="cr-eyebrow">{value.state.replaceAll('_', ' ')}</p><h3><a href={`/app/cases/${value.id}`}>{value.objective}</a></h3><p>{value.nextStep}</p>{value.stopReason && <p className="cr-notice">{value.stopReason}</p>}{value.nextWakeAt && <p>Next check <Timestamp value={value.nextWakeAt} /></p>}</article>)}</div> : <Empty title="No current work">Work shows here while an operation runs.</Empty>}</section>
      <section className="cr-section"><h2>Operating instructions</h2>{instructions.items.length ? <div className="cr-stack">{instructions.items.map(value => <article className="cr-card" key={value.id}><p className="cr-eyebrow">{value.state}</p><h3>{value.objective}</h3><p>{value.impact.summary}</p><a className="cr-link" href={`/app/operations/mandates/${value.id}`}>Review instructions and authority →</a></article>)}</div> : <Empty title="No operating instructions">Instructions show here once an application has them.</Empty>}</section></>}</ResourceState>}</ResourceState>
}
