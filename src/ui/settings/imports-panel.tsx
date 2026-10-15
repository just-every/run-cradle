import { launchImportLabels, type LaunchImportKind } from '../../apps/launch/import-fields'
import { useResource } from '../shared/api'
import { Empty, ResourceState, Timestamp } from '../shared/presentation'

type ImportRecord = { id: string; kind: LaunchImportKind; filename: string | null; committedBy: string | null; committedAt: string; creates: number; updates: number; unchanged: number }

/** Committed launch imports with their stored original files (IMPORT-005). */
export function ImportsPanel() {
 const imports = useResource<{ items: ImportRecord[] }>('/api/v1/launch/imports')
 return <ResourceState resource={imports.resource} operation="imports" retry={imports.refresh}>{page => page.items.length ? <ul className="launch-settings-list">{page.items.map(item => <li key={item.id} className="launch-settings-item"><div className="launch-settings-summary"><strong>{item.filename ?? 'Stored file removed'} · {launchImportLabels[item.kind]}</strong><span>{item.creates} new · {item.updates} updated · {item.unchanged} unchanged · <Timestamp value={item.committedAt} />{item.committedBy ? ` by ${item.committedBy}` : ''}</span></div>{item.filename && <a className="cr-button cr-button--quiet" href={`/api/v1/launch/imports/${item.id}/file`} download>Download file</a>}</li>)}</ul> : <Empty title="No imports yet">Import a CSV from the Campaign Grid; each committed import keeps its original file here.</Empty>}</ResourceState>
}
