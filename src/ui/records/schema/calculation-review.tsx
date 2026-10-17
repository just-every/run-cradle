import './calculation-review.css'
import type { CalculationPreview } from '../../../domains/records/manual/contracts'
import type { EntitySchema } from '../../../domains/records/contracts'
import { CellDisplay } from '../record-fields'
export function CalculationReview({calculations,schemas}:{calculations:CalculationPreview[];schemas:EntitySchema[]}){
 if(!calculations.length)return null
 return <section className="cr-calculation-review"><h3>Calculated results on current records</h3>{calculations.map(calculation=>{const schema=schemas.find(s=>s.id===calculation.entityId)!,field=schema.fields.find(f=>f.id===calculation.fieldId)!;return <article className="cr-tile" key={calculation.fieldId}><h4>{schema.label} · {calculation.label}</h4><p className="cr-muted">Result type: {calculation.resultType}. {calculation.samples.length} of {calculation.totalRecords} current records shown. Adoption requires these records to remain unchanged.</p>{!calculation.samples.length?<p>No current records to preview.</p>:<table className="cr-table"><thead><tr><th scope="col">Record</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>{calculation.samples.map(sample=><tr key={sample.recordId}><th scope="row"><a className="cr-link" href={`/app/records/${schema.appId}/${schema.id}/${sample.recordId}`}>{sample.recordLabel}</a></th><td>{sample.before?<CellDisplay cell={sample.before} field={field} appId={schema.appId} />:'New calculation'}</td><td><CellDisplay cell={sample.after} field={field} appId={schema.appId} /></td></tr>)}</tbody></table>}</article>})}</section>
}
