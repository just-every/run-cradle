import { useRef, useState } from 'react'
import type { BaseAccess } from '../../domains/records/manual/base-role'
import { LAUNCH_APP_ID, launchEntities } from '../../apps/launch/contracts'
import { useResource } from '../shared/api'
import { BaseCollaborators } from './schema/base-collaborators'
import { BaseSchemaReviews } from './schema/base-schema-reviews'
import { ExportBasePanel } from './export-base'
import { ViewSheet } from './view-sheet'
import './base-menu.css'

export type BaseSummary = { id: string; name: string; entryUrl: string }
export function BaseMenu({ apps, appId, manual, onCreate, onEdit }: { apps: BaseSummary[]; appId: string; manual: boolean; onCreate(): void; onEdit(): void }) {
  const [open, setOpen] = useState(false), [panel, setPanel] = useState<'people' | 'reviews' | 'export' | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  const access = useResource<BaseAccess>(manual ? `/api/v1/records/bases/${appId}/access` : null)
  const canManage = access.resource.state === 'ready' && access.resource.data.canManage
  const canAdopt = access.resource.state === 'ready' && access.resource.data.canAdopt
  const reviews = useResource<{ items: unknown[] }>(canManage ? `/api/v1/records/bases/${appId}/reviews` : null, { refreshMs: 15000 })
  const count = reviews.resource.state === 'ready' ? reviews.resource.data.items.length : 0
  const show = (value: typeof panel) => { setOpen(false); setPanel(current => current === value ? null : value) }
  return <div className="cr-base-menu">
    <button ref={anchor} type="button" className="cr-button cr-button--quiet" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Base ▾{count > 0 && <span className="cr-base-menu__count">{count}</span>}</button>
    <ViewSheet title="Base" open={open} onClose={() => setOpen(false)} anchor={anchor}>
      <h3>Bases</h3>{apps.map(app => <a className="cr-menu-row" key={app.id} href={`/app/records/${app.id}`} aria-current={app.id === appId ? 'page' : undefined}>{app.name}</a>)}
      <button type="button" onClick={() => { setOpen(false); onCreate() }}>New base</button>
      <a href="/app/records/?import=base">Import a base</a>
      <h3>This base</h3>
      {canAdopt && <button type="button" onClick={() => { setOpen(false); onEdit() }}>Edit fields</button>}
      {appId === LAUNCH_APP_ID && <a href={`/app/records/${appId}/${launchEntities.customField}`}>Edit fields</a>}
      {canManage && <button type="button" onClick={() => show('people')}>People</button>}
      {canManage && count > 0 && <button type="button" onClick={() => show('reviews')}>Review changes ({count})</button>}
      {manual && <button type="button" onClick={() => show('export')}>Export base</button>}
    </ViewSheet>
    <ViewSheet wide title={panel === 'people' ? 'People' : panel === 'reviews' ? 'Review changes' : 'Export base'} open={panel !== null} onClose={() => setPanel(null)} anchor={anchor}>{panel === 'people' ? <BaseCollaborators appId={appId} /> : panel === 'reviews' ? <BaseSchemaReviews appId={appId} /> : <ExportBasePanel appId={appId} id="cr-export-base" />}</ViewSheet>
  </div>
}
