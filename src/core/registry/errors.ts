import type { ErrorCode, Failure } from '../../contracts/primitives'

export class ApiError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly details: Partial<Omit<Failure['error'], 'code' | 'message' | 'requestId' | 'operation'>> = {}) { super(message) }
}
