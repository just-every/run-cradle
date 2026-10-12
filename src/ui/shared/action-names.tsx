import { useResource } from './api'
type Action = { action: string; description: string; label?: string }
export function ActionNames({ actions }: { actions: string[] }) {
  const catalogue = useResource<Action[]>('/api/v1/actions')
  if (catalogue.resource.state === 'loading') return <span className="cr-muted">Loading permitted actions…</span>
  if (catalogue.resource.state !== 'ready') return <span className="cr-error">Permission descriptions are unavailable.</span>
  const known = catalogue.resource.data
  return <>{actions.map((action, index) => <span key={action}>{index ? ' · ' : ''}{known.find(item => item.action === action)?.label ?? known.find(item => item.action === action)?.description ?? <span className="cr-error">Action outside current visibility</span>}</span>)}</>
}
