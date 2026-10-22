import type { CellValue } from '../../contracts/primitives'

export type CsvImportRow = {
  row: number
  label: string
  id: string
  version: number | null
  before?: Record<string, CellValue>
  values: Record<string, CellValue>
  operation: 'create' | 'update' | 'unchanged'
}
export type CsvImportRejection = { row: number; label: string; message: string; problems?: string[] }
export type CsvImportSummary = { creates: number; updates: number; unchanged: number; rejected: number }
export type CsvImportPreview = CsvImportSummary & {
  id: string
  appId: string
  entityId: string
  expiresAt: string
  rows: CsvImportRow[]
  errors: CsvImportRejection[]
}
