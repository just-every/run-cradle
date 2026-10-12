import type { Failure } from '../../contracts/primitives'
export class AuthorityError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 403, public readonly details: Partial<Omit<Failure['error'], 'code' | 'message' | 'requestId' | 'operation'>> = {}) { super(message); this.name = 'AuthorityError' }
}
export const denied = (message = 'Current authority does not permit this action.'): never => { throw new AuthorityError('forbidden', message) }
