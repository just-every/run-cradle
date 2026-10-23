import type { EntitySchema } from '../contracts'
import type { EntityDescriptor } from '../descriptors.server'
import type { RuleViolationImpact } from './contracts'
import { canonical } from '../../admission/canonical'
import { recordValidationViolations } from '../validation-rules'
import { snapshotValidationValues } from '../validation-values.server'
import type { CellValue } from '../../../contracts/primitives'

/** Validate the exact retained values; adding a default never rewrites existing rows. */
export function previewRuleViolations(schema: EntitySchema, prior: EntityDescriptor | undefined, snapshots: Record<string, Record<string, unknown>[]>, overrides: Readonly<Record<string, Readonly<Record<string, CellValue>>>> = {}) {
  const violations = new Map<string, RuleViolationImpact>()
  const unique = new Map<string, Map<string, string[]>>()
  function add(ruleId: string, ruleName: string, message: string, recordId: string) {
    let violation = violations.get(ruleId)
    if (!violation) { violation = { ruleId, ruleName, message, recordIds: [], count: 0 }; violations.set(ruleId, violation) }
    if (!violation.recordIds.includes(recordId)) { violation.recordIds.push(recordId); violation.count++ }
  }
  for (const row of prior ? snapshots[prior.table.tableId] ?? [] : []) {
    const recordId = String(row[prior!.idColumn]), retained = {...snapshotValidationValues(prior!, row, snapshots),...overrides[recordId]}
    const values = Object.fromEntries(schema.fields.filter(f => f.type !== 'computed').map(field => [field.id, retained[field.id] ?? null]))
    for (const issue of recordValidationViolations(schema, values)) add(issue.ruleId, issue.ruleName, issue.message, recordId)
    for (const field of schema.fields) if (field.unique && field.type !== 'computed' && values[field.id] !== null) {
      let byValue = unique.get(field.id)
      if (!byValue) { byValue = new Map(); unique.set(field.id, byValue) }
      const key = canonical(values[field.id]), ids = byValue.get(key) ?? []
      ids.push(recordId); byValue.set(key, ids)
    }
  }
  for (const [fieldId, values] of unique) {
    const field = schema.fields.find(f => f.id === fieldId)!
    for (const ids of values.values()) if (ids.length > 1) for (const id of ids) add(`${field.id}:unique`, `${field.label} unique`, `${field.label} must be unique.`, id)
  }
  const validationViolations = [...violations.values()]
  const violatingRecordIds = [...new Set(validationViolations.flatMap(v => v.recordIds))]
  return { validationViolations, violatingRecordIds, violatingRecordCount: violatingRecordIds.length }
}
