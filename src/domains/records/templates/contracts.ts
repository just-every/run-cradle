import type { CellValue, Ref, Versioned } from '../../../contracts/primitives'

export const RECORD_TEMPLATE_ENTITY_ID = '00000000000000000000000004'
export type RecordTemplateChild = { entityId: string; parentFieldId: string; values: Record<string, CellValue>; sourceRef: Ref }
export type RecordTemplate = Versioned & {
  appId: string
  entityId: string
  name: string
  sourceRef: Ref
  values: Record<string, CellValue>
  children: RecordTemplateChild[]
}
