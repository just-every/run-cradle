import type { BasePreview, ImportIdentities, ImportOptions, ImportStatus } from '../../../domains/records/base-transfer/contracts'
import type { ManualPreview } from '../../../domains/records/manual/contracts'
import type { Success, Failure } from '../../../contracts/primitives'
import { RequestFailure, readApi } from '../../shared/api'
import { sessionFetch } from '../../shared/session-fetch'
export const importPrefix = '/api/v1/records/base-import'
export type ImportReview = { reviewId: string; fingerprint: string; physicalFingerprint: string; plannedAt: string; planSize: { bytes: number; limit: number }; schemaImpact: ManualPreview }
export async function uploadPreview<T = BasePreview>(operation: 'preview' | 'review', files: File[], options: ImportOptions, identities?: ImportIdentities, acknowledgment?: { fingerprint: string; acceptLoss: boolean }, correspondence?:File,mappingFile?:File): Promise<T> {
  const body = new FormData()
  for (const file of files) body.append('files', file, file.name)
  if(mappingFile)body.append('mappingFile',mappingFile,mappingFile.name)
  if(correspondence)body.append('correspondence',correspondence,correspondence.name)
  body.append('options', JSON.stringify(options))
  if (identities) body.append('identities', JSON.stringify(identities))
  if (acknowledgment) { body.append('fingerprint', acknowledgment.fingerprint); body.append('acceptLoss', String(acknowledgment.acceptLoss)) }
  const response = await sessionFetch(`${importPrefix}/${operation}`, { method: 'POST', body, headers: { Accept: 'application/json' } })
  const result = await response.json() as Success<T> | Failure
  if ('error' in result) throw new RequestFailure(response.status, result.error)
  if (!response.ok || !('data' in result) || !('meta' in result)) throw new Error(`Import ${operation} returned an invalid response (${response.status}).`)
  return result.data
}
export async function importMutation<T>(path: string, data: unknown = {}): Promise<T> {
  return (await readApi<T>(`${importPrefix}/${path}`, { method: 'POST', body: JSON.stringify(data) })).data
}
export function storedJobUrl(id: string) { return `/app/records/?import=base&job=${encodeURIComponent(id)}` }
export function receiptUrl(id: string) { return `${storedJobUrl(id)}&receipt=1` }
export function continuingImportOperation(status:ImportStatus):'resume'|'undo'|'rollback' {
  return ['undoing','undone'].includes(status.job.state)?'undo':['rolling_back','rolled_back'].includes(status.job.state)?'rollback':'resume'
}
/** Reverse batches do not advance the forward checkpoint. The durable fence and
 * published disposition cursor identify actual progress across page reloads. */
export function importProgressKey(status:ImportStatus):string {
  return [status.job.state,status.job.checkpoint,status.job.fence,status.reversal?.cursor??0,status.reversal?.processed??0].join(':')
}
