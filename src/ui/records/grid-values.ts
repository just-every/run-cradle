import type { CellValue } from '../../contracts/primitives'
import type { Field } from '../../domains/records/contracts'
import { decodeCsvValue } from '../../domains/records/csv-values'

export function gridText(field: Field, value: CellValue): string {
  if (value === null) return ''
  if (field.type === 'select') return field.options?.find(option => option.id === value)?.label ?? ''
  if (field.type === 'multi_select' && Array.isArray(value)) return value.map(id => field.options?.find(option => option.id === id)?.label ?? '').join('; ')
  return typeof value === 'string' ? value : typeof value === 'boolean' ? String(value) : JSON.stringify(value)
}
export function gridValue(field: Field, text: string): CellValue {
  if (field.type === 'multi_select') {
    const labels = text.split(';').map(label => label.trim()).filter(Boolean)
    const ids = labels.map(label => {
      const option = field.options?.find(item => item.label === label)
      if (!option) throw Error(`${field.label}: unknown option “${label}”.`)
      return option.id
    })
    return ids
  }
  if (field.type === 'boolean') {
    if (/^(yes|true|1)$/i.test(text)) text = 'true'
    else if (/^(no|false|0)$/i.test(text)) text = 'false'
  }
  return decodeCsvValue(field, text)
}
/** Spreadsheet clipboard text uses TSV with CSV-style quoted multiline cells. */
export function parseGridText(text: string): string[][] {
  const rows: string[][] = [], row: string[] = []
  let value = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char === '"' && (quoted || value === '')) {
      if (quoted && text[i + 1] === '"') { value += '"'; i++ } else quoted = !quoted
    } else if (!quoted && (char === '\t' || char === '\n' || char === '\r')) {
      row.push(value); value = ''
      if (char !== '\t') { rows.push(row.splice(0)); if (char === '\r' && text[i + 1] === '\n') i++ }
    } else value += char
  }
  if (quoted) throw Error('The pasted text has an unfinished quoted cell.')
  if (value !== '' || row.length || !rows.length) { row.push(value); rows.push(row) }
  if (rows.some(item => item.length !== rows[0]!.length)) throw Error('Paste a rectangular range with the same number of columns in every row.')
  return rows
}
export const gridClipboard = (rows: string[][]) => rows.map(row => row.map(value => /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join('\t')).join('\n')
