import { BaseMenu, type BaseSummary } from './base-menu'
import { useDocumentSession } from '../../core/app/document-context'
import { useNavigate } from '@tanstack/react-router'
import { ImportReceipt } from './base-import/receipt'
import { BaseImporter } from './base-import/importer'
import './records.css'
import { SchemaBuilderPanel, newBase, type BuilderTarget } from './schema/schema-builder'
import { AgentProposals } from './proposals/agent-proposals'
import { RecordTable } from './record-table'
import { useEffect, useState, type ReactNode } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema } from '../../domains/records/contracts'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { useResource, type Resource } from '../shared/api'
import { Empty, ResourceState } from '../shared/presentation'

type AppSummary = BaseSummary
export function RecordsPage({ appId, entityId, importBase = false, importJobId, receipt = false }: { appId?: string; entityId?: string; importBase?: boolean; importJobId?: string; receipt?: boolean }) {
  const apps = useResource<Page<AppSummary>>('/api/v1/apps')
  const entities = useResource<Page<EntitySchema>>(appId && !importBase ? `/api/v1/apps/${encodeURIComponent(appId)}/entities` : null)
  const [builder, setBuilder] = useState<BuilderTarget | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const session = useDocumentSession(), navigate = useNavigate()
  const principalId = session?.operator.id
  const baseIds = apps.resource.state === 'ready' ? apps.resource.data.items.map(base => base.id).join(',') : ''
  useEffect(() => {
    if (!importBase && principalId && appId && baseIds.split(',').includes(appId)) {
      try { localStorage.setItem(`cradle.lastBase.${principalId}`, appId) } catch { /* Storage may be disabled. */ }
    }
  }, [appId, principalId, baseIds, importBase])
  useEffect(() => {
    if (appId || importBase || builder || apps.resource.state !== 'ready' || !principalId) return
    const bases = apps.resource.data.items
    if (!bases.length) { setBuilder(newBase()); return }
    let last: string | null = null
    try { last = localStorage.getItem(`cradle.lastBase.${principalId}`) } catch { /* Use the first readable base. */ }
    const target = bases.find(base => base.id === last) ?? bases[0]!
    void navigate({ to: '/app/records/$appId', params: { appId: target.id }, replace: true })
  }, [appId, apps.resource, principalId, importBase, builder, navigate])
  useEffect(() => {
    if (importBase || builder || !appId || entityId || entities.resource.state !== 'ready') return
    const first = entities.resource.data.items.find(entity => entity.label !== 'Private source intake')
    if (first) void navigate({ to: '/app/records/$appId/$entityId', params: { appId, entityId: first.id }, replace: true })
  }, [appId, entityId, entities.resource, importBase, builder, navigate])
  const base = apps.resource.state === 'ready' ? apps.resource.data.items.find(app => app.id === appId) : undefined
  const header = <header className="cr-page-header cr-base-heading"><h1>{base?.name ?? 'Records'}</h1>{base && <BaseMenu apps={apps.resource.state === 'ready' ? apps.resource.data.items : []} appId={base.id} manual={entities.resource.state === 'ready' && entities.resource.data.items.some(entity => entity.physicalRevision.startsWith('manual_'))} onCreate={() => setBuilder(newBase())} onEdit={() => setBuilder({ kind: 'edit', appId: base.id })} />}</header>
  return <OperatorFeaturePage currentPath="/app/records" title=""><div className="cr-page cr-records-page">{importBase && receipt && importJobId ? <ImportReceipt jobId={importJobId} /> : importBase ? <BaseImporter initialJobId={importJobId} /> : <>{header}{!builder && <AgentProposals onOpenChange={setReviewing} />}{reviewing ? null : builder ? <SchemaBuilderPanel target={builder} onTarget={setBuilder} onClose={() => setBuilder(null)} /> : <ResourceState resource={apps.resource} operation="applications" retry={apps.refresh}>{() => appId ? <EntityBrowser appId={appId} entityId={entityId} entities={entities.resource} retry={entities.refresh} /> : null}</ResourceState>}</>}</div></OperatorFeaturePage>
}
function EntityBrowser({ appId, entityId, entities, retry }: { appId: string; entityId?: string; entities: Resource<Page<EntitySchema>>; retry: () => void }) {
  return <ResourceState resource={entities} operation="record types" retry={retry}>{data => { const tabs: ReactNode = <nav aria-label="Record types" className="cr-tabs">{data.items.filter(entity => entity.label !== 'Private source intake').map(entity => <a className="cr-tab" key={entity.id} href={`/app/records/${appId}/${entity.id}`} aria-current={entity.id === entityId ? 'page' : undefined}>{entity.label}</a>)}</nav>; const schema = entityId ? data.items.find(item => item.id === entityId) : undefined; return schema ? <RecordTable key={entityId} schema={schema} tabs={tabs} /> : <section className="cr-card cr-records-card"><div className="cr-records-card-head">{tabs}</div>{entityId ? <Empty headingLevel={2} title="Record type unavailable">Refresh the application or select another record type.</Empty> : <Empty headingLevel={2} title={data.items.length ? 'Choose a record type' : 'No record types yet'}>The application schema determines its fields, relationships and available actions.</Empty>}</section> }}</ResourceState>
}
