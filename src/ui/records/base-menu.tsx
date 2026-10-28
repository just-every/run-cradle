import {useDocumentSession} from '../../core/app/document-context'
import { useRef, useState } from 'react'
import type { BaseAccess } from '../../domains/records/manual/base-role'
import { LAUNCH_APP_ID } from '../../apps/launch/contracts'
import { useResource } from '../shared/api'
import { AccessPanel } from '../settings/access-panel'
import { CustomFieldsPanel } from '../settings/custom-fields-panel'
import { BaseCollaborators } from './schema/base-collaborators'
import { BaseSchemaReviews } from './schema/base-schema-reviews'
import { ExportBasePanel } from './export-base'
import { ViewSheet } from './view-sheet'
import './base-menu.css'

export type BaseSummary = { id: string; name: string; entryUrl: string }
export function BaseMenu({ apps, appId, manual, onCreate, onEdit }: { apps: BaseSummary[]; appId?: string; manual: boolean; onCreate(): void; onEdit(): void }) {
  const guest=Boolean(useDocumentSession()?.guest)
  const [open, setOpen] = useState(false), [panel, setPanel] = useState<'people' | 'reviews' | 'export' | 'fields' | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  const access = useResource<BaseAccess>(manual && appId ? `/api/v1/records/bases/${appId}/access` : null)
  const canManage = access.resource.state === 'ready' && access.resource.data.canManage
  const canAdopt = access.resource.state === 'ready' && access.resource.data.canAdopt
  const reviews = useResource<{ items: unknown[] }>(canManage ? `/api/v1/records/bases/${appId}/reviews` : null, { refreshMs: 15000 })
  const count = reviews.resource.state === 'ready' ? reviews.resource.data.items.length : 0
  const show = (value: typeof panel) => { setOpen(false); setPanel(current => current === value ? null : value) }
  return <div className="cr-base-menu">
    <button ref={anchor} type="button" className="cr-button cr-button--quiet" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Base ▾{count > 0 && <span className="cr-base-menu__count">{count}</span>}</button>
    <ViewSheet title="Base" open={open} onClose={() => setOpen(false)} anchor={anchor}>
      <h3>Bases</h3>{apps.map(app => <a className="cr-menu-row" key={app.id} href={`/app/records/${app.id}`} aria-current={app.id === appId ? 'page' : undefined}>{app.name}</a>)}
      {!guest && <button type="button" onClick={() => { setOpen(false); onCreate() }}>New base</button>}
      {!guest && <a href="/app/records/?import=base">Import a base</a>}
      {appId && <h3>This base</h3>}
      {canAdopt && <button type="button" onClick={() => { setOpen(false); onEdit() }}>Edit fields</button>}
      {!guest && appId === LAUNCH_APP_ID && <button type="button" onClick={() => show('fields')}>Edit fields</button>}
      {!guest && (canManage || appId === LAUNCH_APP_ID) && <button type="button" onClick={() => show('people')}>People</button>}
      {canManage && count > 0 && <button type="button" onClick={() => show('reviews')}>Review changes ({count})</button>}
      {manual && !guest && <button type="button" onClick={() => show('export')}>Export base</button>}
    </ViewSheet>
    <ViewSheet wide title={panel === 'people' ? 'People' : panel === 'reviews' ? 'Review changes' : panel === 'fields' ? 'Edit fields' : 'Export base'} open={panel !== null} onClose={() => setPanel(null)} anchor={anchor}>{appId && (panel === 'people' ? appId === LAUNCH_APP_ID ? <AccessPanel appId={appId} /> : <BaseCollaborators appId={appId} /> : panel === 'reviews' ? <BaseSchemaReviews appId={appId} /> : panel === 'fields' ? <CustomFieldsPanel /> : <ExportBasePanel appId={appId} id="cr-export-base" />)}</ViewSheet>
  </div>
}
