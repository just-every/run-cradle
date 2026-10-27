import { BaseMenu, type BaseSummary } from './base-menu'
import { LAUNCH_APP_ID, launchEntities } from '../../apps/launch/contracts'
import { useDocumentSession } from '../../core/app/document-context'
import { ImportReceipt } from './base-import/receipt'
import { BaseImporter } from './base-import/importer'
import './records.css'
import { SchemaBuilderPanel, newBase, type BuilderTarget } from './schema/schema-builder'
import { AgentProposals } from './proposals/agent-proposals'
import { RecordTable } from './record-table'
import type { ViewPill } from './view-bar'
import { useEffect, useState, type ReactNode } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema } from '../../domains/records/contracts'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { useResource, type Resource } from '../shared/api'
import { Empty, ResourceState } from '../shared/presentation'

type AppSummary = BaseSummary
export function RecordsPage({ appId, entityId, importBase = false, importJobId, receipt = false }: { appId?: string; entityId?: string; importBase?: boolean; importJobId?: string; receipt?: boolean }) {
  const apps = useResource<Page<AppSummary>>(importBase ? null : '/api/v1/apps')
  const [builder, setBuilder] = useState<BuilderTarget | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const session = useDocumentSession()
  const principalId = session?.operator.id
  let remembered: string | null = null
  try { if (principalId) remembered = localStorage.getItem(`cradle.lastBase.${principalId}`) } catch { /* Use the first readable base when storage is unavailable. */ }
  const bases = apps.resource.state === 'ready' ? apps.resource.data.items : []
  const target = appId ? bases.find(base => base.id === appId) : bases.find(base => base.id === remembered) ?? bases[0]
  // Resolve both coordinates before leaving the entry route. Intermediate base
  // pages must not mount a table's readers only to cancel them on the next hop.
  const entityAppId = appId ?? target?.id
  const entities = useResource<Page<EntitySchema>>(entityAppId && !importBase ? `/api/v1/apps/${encodeURIComponent(entityAppId)}/entities` : null)
  const baseIds = apps.resource.state === 'ready' ? apps.resource.data.items.map(base => base.id).join(',') : ''
  useEffect(() => {
    if (!importBase && principalId && appId && baseIds.split(',').includes(appId)) {
      try { localStorage.setItem(`cradle.lastBase.${principalId}`, appId) } catch { /* Storage may be disabled. */ }
    }
  }, [appId, principalId, baseIds, importBase])
  useEffect(() => {
    if (importBase || builder || apps.resource.state !== 'ready') return
    if (!appId && !bases.length) { setBuilder(newBase()); return }
    if (entityId || !target || entities.resource.state !== 'ready') return
    const first = entities.resource.data.items.find(entity => entity.label !== 'Private source intake')
    // Enter the resolved table as its own document, just like the base links.
    // Its shell and readers then hydrate together instead of mounting a
    // transient client leaf while the router is replacing the entry page.
    if (first) window.location.replace(`/app/records/${encodeURIComponent(target.id)}/${encodeURIComponent(first.id)}`)
  }, [appId, entityId, target?.id, apps.resource, entities.resource, importBase, builder])
  const base = apps.resource.state === 'ready' ? apps.resource.data.items.find(app => app.id === appId) : undefined
  const header = <div className="cr-base-heading"><h1>{base?.name ?? 'Records'}</h1><BaseMenu apps={apps.resource.state === 'ready' ? apps.resource.data.items : []} appId={base?.id} manual={entities.resource.state === 'ready' && entities.resource.data.items.some(entity => entity.physicalRevision.startsWith('manual_'))} onCreate={() => setBuilder(newBase())} onEdit={() => base && setBuilder({ kind: 'edit', appId: base.id })} /></div>
  return <OperatorFeaturePage currentPath="/app/records" title=""><div className="cr-page cr-records-page">{importBase && receipt && importJobId ? <ImportReceipt jobId={importJobId} /> : importBase ? <BaseImporter initialJobId={importJobId} /> : <>{(builder || reviewing || (apps.resource.state !== 'loading' && apps.resource.state !== 'ready') || (entities.resource.state !== 'loading' && entities.resource.state !== 'ready') || (!appId && apps.resource.state === 'ready' && !apps.resource.data.items.length)) && <header className="cr-page-header">{header}</header>}{!builder && !!appId && !!entityId && <AgentProposals onOpenChange={setReviewing} />}{reviewing ? null : builder ? <SchemaBuilderPanel target={builder} onTarget={setBuilder} onClose={() => setBuilder(null)} /> : <ResourceState resource={apps.resource} operation="applications" retry={apps.refresh}>{() => appId ? <EntityBrowser appId={appId} entityId={entityId} entities={entities.resource} retry={entities.refresh} heading={header} /> : null}</ResourceState>}</>}</div></OperatorFeaturePage>
}
function EntityBrowser({ appId, entityId, entities, retry, heading }: { appId: string; entityId?: string; entities: Resource<Page<EntitySchema>>; retry: () => void; heading: ReactNode }) {
  return <ResourceState resource={entities} operation="record types" retry={retry}>{data => { if (!entityId && data.items.some(entity => entity.label !== 'Private source intake')) return null; const pills: ViewPill[] = data.items.filter(entity => entity.label !== 'Private source intake' && !(appId === LAUNCH_APP_ID && entity.id === launchEntities.customField)).map(entity => ({ label: entity.label, href: `/app/records/${appId}/${entity.id}`, current: entity.id === entityId, group: 'tables' })); const schema = entityId ? data.items.find(item => item.id === entityId) : undefined; return schema ? <RecordTable key={entityId} schema={schema} pills={pills} heading={heading} /> : <><header className="cr-page-header">{heading}</header><section className="cr-card cr-records-card"><div className="cr-records-card-head">{pills.map(pill => <a key={pill.href} href={pill.href}>{pill.label}</a>)}</div>{entityId ? <Empty headingLevel={2} title="Record type unavailable">Refresh the application or select another record type.</Empty> : <Empty headingLevel={2} title={data.items.length ? 'Choose a record type' : 'No record types yet'}>The application schema determines its fields, relationships and available actions.</Empty>}</section></> }}</ResourceState>
}
