import { ZodError, type ZodType } from 'zod'
import { AdmissionError } from '../../domains/admission/errors'

/** Parse a merged import row, naming each missing or invalid field in words an operator can fix. */
export function parseImportRow<T>(schema: ZodType<T>, merged: unknown): T {
 try { return schema.parse(merged) } catch (error) {
  if (!(error instanceof ZodError)) throw error
  throw new AdmissionError('validation', error.issues.map(issue => { const field = issue.path.join('.'); return issue.code === 'invalid_type' && issue.message.includes('received undefined') ? `${field} is required for a new record` : `${field}: ${issue.message}` }).join('; '))
 }
}
