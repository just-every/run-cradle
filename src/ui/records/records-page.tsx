import { BaseCollaborators } from './schema/base-collaborators'
import { BaseSchemaReviews } from './schema/base-schema-reviews'
import type { BaseAccess } from '../../domains/records/manual/base-role'
import { ImportReceipt } from './base-import/receipt'
import { BaseImporter } from './base-import/importer'
import './records.css'
import { SchemaBuilderPanel, newBase, type BuilderTarget } from './schema/schema-builder'
import { TemplateCards } from './schema/template-cards'
import { AgentProposals } from './proposals/agent-proposals'
import { ExportBasePanel } from './export-base'
import { RecordTable } from './record-table'
import { useState, type ReactNode } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema } from '../../domains/records/contracts'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { useResource, type Resource } from '../shared/api'
import { CradleArt } from '../shared/cradle-art'
import { Empty, ResourceState } from '../shared/presentation'

type AppSummary = { id: string; name: string; entryUrl: string }
export function RecordsPage({ appId, entityId, importBase = false, importJobId, receipt = false }: { appId?: string; entityId?: string; importBase?: boolean; importJobId?: string; receipt?: boolean }) {
  const apps = useResource<Page<AppSummary>>('/api/v1/apps')
  const entities = useResource<Page<EntitySchema>>(appId && !importBase ? `/api/v1/apps/${encodeURIComponent(appId)}/entities` : null)
  const [builder, setBuilder] = useState<BuilderTarget | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const noBases = apps.resource.state === 'ready' && apps.resource.data.items.length === 0
  // With no application chosen, Create base is the page's main action, as on the empty page.
  const choosing = apps.resource.state === 'ready' && !appId
  const header = <header className="cr-page-header"><h1>Records</h1><div className="cr-actions">{(noBases || choosing) && !builder && !reviewing && <button className="cr-button" onClick={() => setBuilder(newBase())}>Create base</button>}<a className="cr-button cr-button--quiet" href="/app/records/?import=base">Import a base</a></div></header>
  return <OperatorFeaturePage currentPath="/app/records" title=""><div className="cr-page cr-records-page">{importBase && receipt && importJobId ? <ImportReceipt jobId={importJobId} /> : importBase ? <BaseImporter initialJobId={importJobId} /> : <>{header}{!builder && <AgentProposals onOpenChange={setReviewing} />}{reviewing ? null : builder ? <SchemaBuilderPanel target={builder} onTarget={setBuilder} onClose={() => setBuilder(null)} /> : <ResourceState resource={apps.resource} operation="applications" retry={apps.refresh}>{data => data.items.length === 0 ? <FirstBase onTemplate={id => setBuilder(newBase(id))} /> : <><BaseBar apps={data.items} appId={appId} entities={entities.resource} onCreate={() => setBuilder(newBase())} onEdit={() => appId && setBuilder({ kind: 'edit', appId })} />{appId ? <EntityBrowser appId={appId} entityId={entityId} entities={entities.resource} retry={entities.refresh} /> : <><section className="cr-empty cr-first-base"><CradleArt variant="empty" /><h2>Choose an application</h2><p>Each application keeps its own records and access rules.</p></section><TemplateCards onUse={id => setBuilder(newBase(id))} /></>}</>}</ResourceState>}</>}</div></OperatorFeaturePage>
}
function FirstBase({ onTemplate }: { onTemplate: (templateId: string) => void }) {
  return <><section className="cr-empty cr-first-base"><CradleArt variant="empty" /><h2>Create your first base</h2><p>Build your tables and fields above, or start from a template.</p></section><TemplateCards onUse={onTemplate} /></>
}
/** The base switcher and the base actions: tabs on the left, quiet pills on the right, the export panel below. */
function BaseBar({ apps, appId, entities, onCreate, onEdit }: { apps: AppSummary[]; appId?: string; entities: Resource<Page<EntitySchema>>; onCreate: () => void; onEdit: () => void }) {
  const [exporting, setExporting] = useState(false),[collaborators,setCollaborators]=useState(false),[reviews,setReviews]=useState(false)
  const manual = entities.state === 'ready' && entities.data.items.some(entity => entity.physicalRevision.startsWith('manual_'))
  const access=useResource<BaseAccess>(manual&&appId?`/api/v1/records/bases/${appId}/access`:null),canAdopt=access.resource.state==='ready'&&access.resource.data.canAdopt,canManage=access.resource.state==='ready'&&access.resource.data.canManage
  return <div className="cr-base-bar"><div className="cr-base-row"><nav className="cr-tabs" aria-label="Application records">{apps.map(app => <a className="cr-tab" href={`/app/records/${app.id}`} key={app.id} aria-current={app.id === appId ? 'page' : undefined}>{app.name}</a>)}</nav><div className="cr-actions cr-base-actions">{appId && <button className="cr-button cr-button--quiet" onClick={onCreate}>Create base</button>}{appId && canAdopt && <button className="cr-button cr-button--quiet" onClick={onEdit}>Edit base schema</button>}{appId&&canManage&&<><button className="cr-button cr-button--quiet" aria-expanded={collaborators} onClick={()=>setCollaborators(value=>!value)}>Base collaborators</button><button className="cr-button cr-button--quiet" aria-expanded={reviews} onClick={()=>setReviews(value=>!value)}>Review schema changes</button></>}{appId && manual && <button className="cr-button cr-button--quiet" aria-expanded={exporting} aria-controls="cr-export-base" onClick={() => setExporting(open => !open)}>Export base</button>}</div></div>{appId && manual && exporting && <ExportBasePanel appId={appId} id="cr-export-base" />}{appId&&canManage&&collaborators&&<BaseCollaborators appId={appId} />}{appId&&canManage&&reviews&&<BaseSchemaReviews appId={appId} />}</div>
}
function EntityBrowser({ appId, entityId, entities, retry }: { appId: string; entityId?: string; entities: Resource<Page<EntitySchema>>; retry: () => void }) {
  return <ResourceState resource={entities} operation="record types" retry={retry}>{data => { const tabs: ReactNode = <nav aria-label="Record types" className="cr-tabs">{data.items.filter(entity => entity.label !== 'Private source intake').map(entity => <a className="cr-tab" key={entity.id} href={`/app/records/${appId}/${entity.id}`} aria-current={entity.id === entityId ? 'page' : undefined}>{entity.label}</a>)}</nav>; const schema = entityId ? data.items.find(item => item.id === entityId) : undefined; return schema ? <RecordTable key={entityId} schema={schema} tabs={tabs} /> : <section className="cr-card cr-records-card"><div className="cr-records-card-head">{tabs}</div>{entityId ? <Empty headingLevel={2} title="Record type unavailable">Refresh the application or select another record type.</Empty> : <Empty headingLevel={2} title={data.items.length ? 'Choose a record type' : 'No record types yet'}>The application schema determines its fields, relationships and available actions.</Empty>}</section> }}</ResourceState>
}
