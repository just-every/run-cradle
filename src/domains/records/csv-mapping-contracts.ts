export type CsvColumnMapping = { column: string; fieldId: string }
export type CsvSavedMapping = {
  id: string; sourceName: string; version: number; createdAt: string; updatedAt: string
  mapping: CsvColumnMapping[]; mergeFieldId: string
}
export type CsvMappingChoice = Pick<CsvSavedMapping, 'id' | 'sourceName' | 'version' | 'updatedAt'> & { available: boolean; problem?: string }
