import type { EntitySchema } from '../../../domains/records/contracts'
import type { SchemaImpact } from '../../../domains/records/manual/contracts'
import { UiIcon } from '../../shared/ui-icon'
import { impactChangeLabel } from './field-type-label'

const changeKind = (change: string) => /^(Add|Create) /.test(change) ? 'add' : /^Remove /.test(change) ? 'remove' : 'change'
const changeIcon = { add: 'plus', remove: 'minus', change: 'pencil' } as const

/** Removal and conversion counts come from the reviewed, server-owned impact. */
function RemovalStats({ impacts }: { impacts: SchemaImpact[] }) {
  const removed = impacts.flatMap(impact => impact.removedFields)
  const conversions=impacts.flatMap(impact=>impact.conversions??[]),tables=impacts.filter(impact=>impact.deletedTable)
  if (!removed.length&&!conversions.length&&!tables.length) return null
  const fields=new Set([...removed.map(field=>field.id),...conversions.map(conversion=>conversion.fieldId)])
  const records = impacts.filter(impact => impact.removedFields.length > 0||impact.deletedTable||impact.conversions?.length).reduce((total, impact) => total + impact.count, 0)
  const values = removed.reduce((total, field) => total + field.populated, 0)+conversions.reduce((total,conversion)=>total+conversion.losses.length,0)
  return <div className="cr-stats"><div className="cr-stat"><b>{fields.size}</b><span>{fields.size === 1 ? 'field touched' : 'fields touched'}</span></div><div className="cr-stat"><b>{records}</b><span>records affected</span></div><div className="cr-stat cr-stat--warn"><b>{values}</b><span>values removed</span></div></div>
}

/** The schema-impact screen, one tile per table: what changes, which records it touches and how removed values are recovered. The owner's schema builder and agent proposals both use it. */
export function SchemaImpactReview({ appId, impacts, schemas, access, recovery }: { appId: string; impacts: SchemaImpact[]; schemas: EntitySchema[]; access: string; recovery: string }) {
  return <>
    <h3>Review schema changes</h3><p className="cr-muted">{access}</p>
    <RemovalStats impacts={impacts} />
    <div className="cr-impact-grid">{impacts.filter(impact => impact.changes.length > 0||impact.deletedTable||impact.conversions?.length||impact.dependencies?.length||impact.refusals?.length).map(impact => { const removesValues = impact.deletedTable||impact.removedFields.some(field => field.populated > 0)||impact.conversions?.some(conversion=>conversion.losses.length>0); return <article className="cr-tile cr-impact" key={impact.entityId}>
      <header><h4>{impact.label}</h4><span className={`cr-tag ${removesValues ? 'cr-tag--warn' : 'cr-tag--ok'}`}>{impact.count} {impact.count === 1 ? 'affected record' : 'affected records'}</span></header>
      <ul className="cr-change-list">{impact.changes.map(change => { const kind = changeKind(change); return <li key={change}><span className={`cr-change-icon cr-change-icon--${kind}`}><UiIcon name={changeIcon[kind]} size={12} /></span><span>{impactChangeLabel(change, schemas.find(schema => schema.id === impact.entityId)?.fields ?? [])}</span></li> })}</ul>
      {(impact.deletedTable||impact.removedFields.length>0)&&<p className="cr-notice">{impact.deletedTable?'This table and its records move':'Removed fields and their values move'} to Trash for 30 days after adoption. Restore is available only while you still have permission to delete them.</p>}
      {impact.conversions?.map(conversion=><section key={conversion.fieldId} aria-label={`Conversion of ${conversion.label}`}>
        <h5>{conversion.label}: {conversion.from} → {conversion.to}</h5>
        <p>{conversion.converted.length} {conversion.converted.length===1?'value converts':'values convert'}; {conversion.losses.length} {conversion.losses.length===1?'value is lost':'values are lost'}.</p>
        {conversion.refusal&&<p role="alert" className="cr-error">{conversion.refusal}</p>}
        {conversion.converted.length>0&&<details className="cr-detail" open><summary>Converted values ({conversion.converted.length})</summary><ul>{conversion.converted.map(value=><li key={value.recordId} style={{overflowWrap:'anywhere'}}><a className="cr-link" href={`/app/records/${appId}/${impact.entityId}/${value.recordId}`}>{value.recordId}</a>: {value.beforeLabel} → {value.afterLabel}</li>)}</ul></details>}
        {conversion.losses.length>0&&<details className="cr-detail" open><summary>Lost values ({conversion.losses.length})</summary><ul>{conversion.losses.map(value=><li key={value.recordId} style={{overflowWrap:'anywhere'}}><a className="cr-link" href={`/app/records/${appId}/${impact.entityId}/${value.recordId}`}>{value.recordId}</a>: {value.valueLabel} — {value.reason}</li>)}</ul></details>}
      </section>)}
      {!!impact.dependencies?.length&&<details className="cr-detail" open><summary>Dependent items ({impact.dependencies.length})</summary><ul>{impact.dependencies.map(dependency=><li key={dependency.kind+':'+dependency.id}><strong>{dependency.name}</strong> ({dependency.kind})<ul>{dependency.details.map((detail,index)=><li key={index} style={{overflowWrap:'anywhere'}}>{detail}</li>)}</ul></li>)}</ul></details>}
      {!!impact.refusals?.length&&<div className="cr-notice" role="alert"><p>Resolve these issues before adopting:</p><ul>{impact.refusals.map((refusal,index)=><li key={index}>{refusal}</li>)}</ul></div>}
      {!!impact.validationViolations?.length && <div className="cr-notice" role="alert"><p>Resolve {impact.violatingRecordCount} existing {impact.violatingRecordCount===1?'record':'records'} before adopting these rules.</p>{impact.validationViolations.map(rule=><details className="cr-detail" key={rule.ruleId}><summary>{rule.ruleName}: {rule.count} {rule.count === 1 ? 'record' : 'records'}</summary><p>{rule.message}</p><ul>{rule.recordIds.map(id=><li key={id}><a href={`/app/records/${appId}/${impact.entityId}/${id}`}>{id}</a></li>)}</ul></details>)}</div>}
      {impact.recordIds.length > 0 && <details className="cr-detail"><summary>Affected record identities</summary><ul>{impact.recordIds.map(id => <li key={id}><a className="cr-link" href={`/app/records/${appId}/${impact.entityId}/${id}`}>{id}</a></li>)}</ul></details>}
    </article> })}</div>
    {impacts.some(impact => impact.removedFields.length > 0||impact.deletedTable||impact.conversions?.some(conversion=>conversion.losses.length>0)) && <p className="cr-recovery"><UiIcon name="check" size={18} /><span><strong>Recovery:</strong> {recovery}</span></p>}
  </>
}
