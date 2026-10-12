import type { Cell, Ref } from '../../contracts/primitives'
import { REPAIRS_APP_ID, REPAIR_ENTITIES } from '../../apps/repairs/model'
const id = /^[0-9A-HJKMNP-TV-Z]{26}$/
export function repairHref(subject: Ref): string | null {
  return subject.appId === REPAIRS_APP_ID && subject.entityId === REPAIR_ENTITIES.workOrders && id.test(subject.recordId) ? `/app/repairs/${subject.recordId}` : null
}
export function contractorReference(cell: Cell | undefined): Ref | null {
  if (cell?.state !== 'value' || !cell.value || typeof cell.value !== 'object' || Array.isArray(cell.value) || !('recordId' in cell.value)) return null
  const value = cell.value
  return value.appId === REPAIRS_APP_ID && value.entityId === REPAIR_ENTITIES.contractors && id.test(value.recordId) ? value : null
}
export function quoteSourceHref(sourceId: string, version: number, workOrder: Ref): string {
  const repair = repairHref(workOrder)
  return `/app/evidence/${sourceId}?version=${version}${repair ? `&repairId=${workOrder.recordId}` : ''}`
}
