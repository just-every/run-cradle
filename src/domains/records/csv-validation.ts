import { AdmissionError } from '../admission/errors'
import type { Field } from './contracts'
import { validateCell } from './validators'

/** Translate typed cell failures at the CSV boundary, before validator details reach a person. */
export function validateCsvCell(field: Field, value: unknown) {
  try { return validateCell(field, value) } catch (error) {
    if (!(error instanceof AdmissionError) || error.code !== 'validation') throw error
    const required = field.required && (value === null || typeof value === 'string' && !value.trim())
    const reasons: Record<Field['type'], string> = {
      number: 'Enter a number such as 12 or 12.50 (up to 128 integer and 32 decimal digits).',
      date: 'Enter a real calendar date as YYYY-MM-DD or M/D/YYYY.',
      instant: 'Enter a UTC date and time such as 2027-01-15T08:00:00.000Z.',
      boolean: 'Enter Yes/No, true/false, checked/unchecked or 1/0.',
      url: 'Enter a complete http:// or https:// website address.',
      select: 'Choose one of this field’s available options.',
      multi_select: 'Choose available options without duplicates.',
      relation: 'Use an available linked record in the required CSV format.',
      money: 'Enter a USD amount such as $1,234.50, or an exported money value with its currency and precision.',
      person: 'Use an available person’s record ID.',
      attachment: 'Use exported file references.',
      text: 'Enter text within the 100,000 character limit.',
      computed: 'Calculated fields cannot be imported. Skip this column.',
    }
    throw new AdmissionError('validation', `${field.label}: ${required ? 'A value is required.' : reasons[field.type]}`)
  }
}
