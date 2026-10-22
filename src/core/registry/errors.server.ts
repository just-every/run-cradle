import { AdmissionError } from '../../domains/admission/errors'
import { AuthorityError } from '../../domains/authority/errors'
import { ZodError } from 'zod'
import { AuthError } from '../../../vendor/base/modules/operator-auth/index.mjs'
import type { ErrorCode, Failure } from '../../contracts/primitives'
import { ApiError } from './errors'
export { ApiError } from './errors'

const statusByCode: Record<ErrorCode, number> = {
  validation: 400, signed_out: 401, forbidden: 403, not_found: 404,
  version_conflict: 409, stale_cursor: 409, stale_evidence: 409, schema_conflict: 409,
  capacity_limit: 409, idempotency_conflict: 409, invalid_transition: 409,
  separation_of_duties: 403, grant_expired: 403, grant_revoked: 403,
  budget_exhausted: 429, unconfigured: 503, provider_unavailable: 503,
  provider_refused: 422, invalid_provider_output: 502, unknown_outcome: 409,
  upload_rejected: 413, rate_limited: 429, evaluation_failed: 422, release_conflict: 409, internal: 500,
}
export function errorResponse(error: unknown, requestId: string, operation: string): Response {
  // Base owns the public auth error vocabulary and status. Only its exported
  // class is trusted; provider/DB exceptions still receive the generic failure.
  if (error instanceof AuthError) return Response.json({ error: {
    requestId, operation, code: error.code, message: error.code, retry: 'after_change',
  } }, { status: error.status, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } })
  if (error instanceof AdmissionError) error = new ApiError(error.code, error.message, error.currentVersion===undefined?{}:{currentVersion:error.currentVersion})
  if (error instanceof AuthorityError) error = new ApiError(error.code in statusByCode ? error.code as ErrorCode : 'forbidden', error.message, error.details)
  if(error instanceof Error){const limit=error.message.match(/LIMIT (recordsPerTable|recordsPerBase) value (\d+) CURRENT (\d+)/);if(limit)error=new ApiError('capacity_limit',limit[0])}
  if (error instanceof ZodError) error = new ApiError('validation', 'The request did not match its schema.', { issues: error.issues.map(issue => ({ path: issue.path.map(String).join('.'), message: issue.message })) })
  const known = error instanceof ApiError ? error : null
  const code: ErrorCode = known ? known.code : 'internal'
  const failure: Failure = { error: { requestId, operation, code, message: known ? known.message : 'The operation could not be completed.', retry: known && code !== 'internal' ? 'after_change' : 'never', ...(known ? known.details : {}) } }
  return Response.json(failure, { status: statusByCode[code], headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } })
}
