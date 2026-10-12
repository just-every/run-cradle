import { ImportInputError } from './input-error'
import type { RelationPlan } from './links'
import type { ImportDiagnostic } from './contracts'
const edges=(plan:RelationPlan)=>new Set(plan.cells.flatMap(cell=>cell.references.filter(ref=>ref.state==='resolved'||!!ref.selection).map(ref=>JSON.stringify([cell.rowKey,ref.targetRowKey]))))

/** Explicit public projection coordinates preserve a native writer, even when
 * it appears later or has several separately named incoming projections. */
export function declaredProjections(plans:RelationPlan[]):ImportDiagnostic[] {
 const diagnostics:ImportDiagnostic[]=[]
 for(const projection of plans){if(!projection.derivedFrom)continue
  const canonical=plans.find(plan=>plan.table.key===projection.derivedFrom!.tableKey&&plan.column.key===projection.derivedFrom!.columnKey)
  if(!canonical||canonical===projection||canonical.derivedFrom||canonical.targetTableKey!==projection.table.key||projection.targetTableKey!==canonical.table.key||projection.reciprocal&&(projection.reciprocal.tableKey!==canonical.table.key||projection.reciprocal.columnKey!==canonical.column.key))throw new ImportInputError(`${projection.table.label}.${projection.column.label}: derived projection must identify one opposite canonical writable link column`)
  canonical.declaredCanonical=true
  const expected=edges(canonical),actual=new Set([...edges(projection)].map(edge=>{const [a,b]=JSON.parse(edge);return JSON.stringify([b,a])}))
  if(expected.size!==actual.size||[...expected].some(edge=>!actual.has(edge))||projection.cells.some(cell=>cell.error||cell.references.some(ref=>ref.state!=='resolved'&&!ref.selection)))diagnostics.push({code:'RECIPROCAL_DISAGREEMENT',tableKey:projection.table.key,columnKey:projection.column.key,message:`Derived incoming projection differs from ${canonical.table.label}.${canonical.column.label}; the explicitly selected canonical writer determines native links. Exported projection cells remain in the source and full reference report.`})
  projection.inverseOf={tableKey:canonical.table.key,columnKey:canonical.column.key}
  projection.inverseDescription=`Explicit derived projection of ${canonical.table.label}.${canonical.column.label}; the selected canonical source owns link order and is the only writable field.`
  diagnostics.push({code:'RECIPROCAL_CANONICAL',tableKey:projection.table.key,columnKey:projection.column.key,message:projection.inverseDescription})
 }
 return diagnostics
}
