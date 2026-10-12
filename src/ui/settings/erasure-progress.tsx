import { useResource } from '../shared/api'

export type ErasureReceipt = { id: string; confirmed: boolean }

export function ErasureProgress({ id, confirmed }: ErasureReceipt) {
  const receipt = useResource<{ state: string }>(`/api/v1/erasures/${encodeURIComponent(id)}`)
  const complete = confirmed || receipt.resource.state === 'ready' && receipt.resource.data.state === 'complete'
  return <div role="status"><p>{complete ? 'Identity erasure and file deletion are complete.' : 'Identity has been anonymised. File deletion remains pending; erasure is not yet complete.'}</p>{!complete && <button className="cr-button cr-button--quiet" onClick={receipt.refresh}>Check erasure completion</button>}</div>
}
