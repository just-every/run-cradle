import { repairActionSchemas, type RepairActionInput } from './contracts'

const prefix = 'Manual quote transcription; original source supplied by the reviewer:\n'
const separator = '\nExact recorded terms:\n'
const termsSchema = repairActionSchemas['repair.record-quote'].omit({ evidence: true })

// Preserve the existing source bytes. Presentation does not grant these terms authority.
export function manualQuoteSource(original: string, terms: Omit<RepairActionInput<'repair.record-quote'>, 'evidence'>): string {
  return `${prefix}${original}${separator}${JSON.stringify(terms)}`
}

export function splitManualQuoteSource(text: string): { original: string; terms: string } | null {
  if (!text.startsWith(prefix)) return null
  const boundary = text.lastIndexOf(separator)
  if (boundary < prefix.length) return null
  const terms = text.slice(boundary + separator.length)
  try {
    if (!termsSchema.safeParse(JSON.parse(terms)).success) return null
    return { original: text.slice(prefix.length, boundary), terms }
  } catch { return null }
}
