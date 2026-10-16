import { useEffect } from 'react'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState, Timestamp } from '../shared/presentation'

type Installation = { id: string; installedAt: string; installedBy: string | null; records: number; campaigns: number }

/** Install example campaigns in one action and remove exactly those records later (SET-003). */
export function SampleDataPanel() {
 const installed = useResource<{ items: Installation[] }>('/api/v1/launch/samples')
 const install = useCommand<{ installationId: string; recordIds: string[] }>('launch-samples-install')
 useEffect(() => { if (install.result.state === 'committed') { installed.refresh(); window.dispatchEvent(new Event('cradle-session-changed')) } }, [install.result.state])
 return <div className="cr-stack"><p>Sample data adds example campaigns with their deliverables, milestones, risks and decisions. Removing it deletes only the records it added, and is refused once any of them has been edited.</p>
  <ResourceState resource={installed.resource} operation="sample data" retry={installed.refresh}>{page => page.items.length > 0 && <ul className="launch-settings-list">{page.items.map(item => <SampleRow key={item.id} item={item} onRemoved={installed.refresh} />)}</ul>}</ResourceState>
  <div><button type="button" className="cr-button cr-button--quiet" disabled={['submitting', 'pending', 'unknown'].includes(install.result.state)} onClick={() => void install.submit('/api/v1/commands/launch.samples.install', {}, [])}>Install sample data</button></div>
  {install.result.state === 'committed' ? <p className="cr-notice cr-notice--committed" role="status">Installed {install.result.value.recordIds.length} sample records.</p> : <CommandFeedback {...install} />}
 </div>
}
function SampleRow({ item, onRemoved }: { item: Installation; onRemoved: () => void }) {
 const remove = useCommand<{ removedIds: string[] }>(`launch-samples-remove:${item.id}`)
 useEffect(() => { if (remove.result.state === 'committed') onRemoved() }, [remove.result.state])
 return <li className="launch-settings-item"><div className="launch-settings-summary"><strong>Sample data · {item.campaigns} campaigns, {item.records} records</strong><span>Installed <Timestamp value={item.installedAt} />{item.installedBy ? ` by ${item.installedBy}` : ''}</span></div>
  <div className="cr-actions"><button type="button" className="cr-button cr-button--quiet" disabled={['submitting', 'pending', 'unknown'].includes(remove.result.state)} onClick={() => void remove.submit('/api/v1/commands/launch.samples.remove', { installationId: item.id }, [])}>Remove sample data</button></div><CommandFeedback {...remove} /></li>
}
