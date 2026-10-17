import type { EntitySchema } from '../../../domains/records/contracts'
import type { SchemaImpact } from '../../../domains/records/manual/contracts'
import { UiIcon } from '../../shared/ui-icon'
import { impactChangeLabel } from './field-type-label'

const changeKind = (change: string) => /^(Add|Create) /.test(change) ? 'add' : /^Remove /.test(change) ? 'remove' : 'change'
const changeIcon = { add: 'plus', remove: 'minus', change: 'pencil' } as const

/** Counts that removing fields would touch, from the impacts themselves. Nothing is shown when no field is removed. */
function RemovalStats({ impacts }: { impacts: SchemaImpact[] }) {
  const removed = impacts.flatMap(impact => impact.removedFields)
  if (!removed.length) return null
  const records = impacts.filter(impact => impact.removedFields.length > 0).reduce((total, impact) => total + impact.count, 0)
  const values = removed.reduce((total, field) => total + field.populated, 0)
  return <div className="cr-stats"><div className="cr-stat"><b>{removed.length}</b><span>{removed.length === 1 ? 'field touched' : 'fields touched'}</span></div><div className="cr-stat"><b>{records}</b><span>records affected</span></div><div className="cr-stat cr-stat--warn"><b>{values}</b><span>values removed</span></div></div>
}

/** The schema-impact screen, one tile per table: what changes, which records it touches and how removed values are recovered. The owner's schema builder and agent proposals both use it. */
export function SchemaImpactReview({ appId, impacts, schemas, access, recovery }: { appId: string; impacts: SchemaImpact[]; schemas: EntitySchema[]; access: string; recovery: string }) {
  return <>
    <h3>Review schema changes</h3><p className="cr-muted">{access}</p>
    <RemovalStats impacts={impacts} />
    <div className="cr-impact-grid">{impacts.filter(impact => impact.changes.length > 0).map(impact => { const removesValues = impact.removedFields.some(field => field.populated > 0); return <article className="cr-tile cr-impact" key={impact.entityId}>
      <header><h4>{impact.label}</h4><span className={`cr-tag ${removesValues ? 'cr-tag--warn' : 'cr-tag--ok'}`}>{impact.count} {impact.count === 1 ? 'affected record' : 'affected records'}</span></header>
      <ul className="cr-change-list">{impact.changes.map(change => { const kind = changeKind(change); return <li key={change}><span className={`cr-change-icon cr-change-icon--${kind}`}><UiIcon name={changeIcon[kind]} size={12} /></span><span>{impactChangeLabel(change, schemas.find(schema => schema.id === impact.entityId)?.fields ?? [])}</span></li> })}</ul>
      {!!impact.validationViolations?.length && <div className="cr-notice" role="alert"><p>Resolve {impact.violatingRecordCount} existing {impact.violatingRecordCount===1?'record':'records'} before adopting these rules.</p>{impact.validationViolations.map(rule=><details className="cr-detail" key={rule.ruleId}><summary>{rule.ruleName}: {rule.count} {rule.count === 1 ? 'record' : 'records'}</summary><p>{rule.message}</p><ul>{rule.recordIds.map(id=><li key={id}><a href={`/app/records/${appId}/${impact.entityId}/${id}`}>{id}</a></li>)}</ul></details>)}</div>}
      {impact.recordIds.length > 0 && <details className="cr-detail"><summary>Affected record identities</summary><ul>{impact.recordIds.map(id => <li key={id}><a className="cr-link" href={`/app/records/${appId}/${impact.entityId}/${id}`}>{id}</a></li>)}</ul></details>}
    </article> })}</div>
    {impacts.some(impact => impact.removedFields.length > 0) && <p className="cr-recovery"><UiIcon name="check" size={18} /><span><strong>Recovery:</strong> {recovery}</span></p>}
  </>
}
