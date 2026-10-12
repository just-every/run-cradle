import { ImportInputError } from './input-error'
import { referenceCoordinate,type CorrespondenceReview } from './correspondence-format'
import type { Json } from '../../../../vendor/base/modules/import-kit/src/types'
import type { ImportDiagnostic,PreparedSource,SourceTable,SourceColumn,ImportOptions,ImportIdentities } from './contracts'
import { rawText } from './format'
import { declaredProjections } from './link-projections'
import { parseLinkCell } from './parse'
export type ReferenceResolution={effectiveRecordId?:string;selection?:ImportDiagnostic['selection'];raw:Json;reference:string;state:'resolved'|'unresolved'|'ambiguous';candidates:string[];targetRowKey?:string;materializable:boolean}
export type LinkCell={tableKey:string;rowKey:string;columnKey:string;targetTableKey?:string;references:ReferenceResolution[];error?:ImportDiagnostic}
export type RelationPlan={table:SourceTable;column:SourceColumn;targetTableKey?:string;cardinality:'one'|'many';cells:LinkCell[];inverseOf?:{tableKey:string;columnKey:string};inverseDescription?:string;reciprocal?:{tableKey:string;columnKey:string};derivedFrom?:{tableKey:string;columnKey:string};declaredCanonical?:boolean}
export function resolveLinks(source:PreparedSource,options:ImportOptions,identities:ImportIdentities,rejected:Set<string>,relationColumns:{table:SourceTable;column:SourceColumn}[],review?:CorrespondenceReview):RelationPlan[] {
 const plans:RelationPlan[]=[],selections=new Map(review?.accepted?review.references.map(r=>[r.key,r]):[])
 for(const {table,column} of relationColumns){
  const override=options.tables?.[table.key]?.columns?.[column.key]??{},targetTableKey=override.relationTableKey??column.relationTableKey,target=source.tables.find(t=>t.key===targetTableKey)
  const primary=target&&(options.tables?.[target.key]?.primaryColumnKey??target.primaryColumnKey??target.columns[0].key)
  const byLabel=new Map<string,string[]>()
  if(target)for(const row of target.rows){const key=source.format==='api'?row.key:rawText(row.values[primary!]);const matches=byLabel.get(key);if(matches)matches.push(row.key);else byLabel.set(key,[row.key])}
  const cells=table.rows.map(row=>{
   const raw=row.values[column.key]??'',cell:LinkCell={tableKey:table.key,rowKey:row.key,columnKey:column.key,...(targetTableKey!==undefined?{targetTableKey}:{}),references:[]}
   try{
    const refs=Array.isArray(raw)?raw.map(rawText):parseLinkCell(rawText(raw))
    cell.references=refs.map((reference,occurrence)=>{const candidates=byLabel.get(reference)??[],state=candidates.length===1?'resolved':candidates.length?'ambiguous':'unresolved',selection=selections.get(referenceCoordinate(table.key,row.key,column.key,occurrence)),targetRowKey=selection?.selectedRowKey??(state==='resolved'?candidates[0]:undefined),effectiveRecordId=targetRowKey?identities.tables[targetTableKey!].records[targetRowKey]:undefined;return {raw,reference,state,candidates:candidates.map(k=>identities.tables[targetTableKey!].records[k]),...(targetRowKey?{targetRowKey,effectiveRecordId}:{}),...(selection?{selection:{source:'owner-reviewed-correspondence' as const,selectedSourceRow:selection.selectedRowKey,selectedNativeRecordId:effectiveRecordId!,acceptedFingerprint:review!.fingerprint}}:{}),materializable:!!targetRowKey&&!rejected.has(canonicalRow(targetTableKey!,targetRowKey))&&!rejected.has(canonicalRow(table.key,row.key))}})
   }catch(error){cell.error={code:'LINK_PARSE',tableKey:table.key,rowKey:row.key,columnKey:column.key,raw,location:row.location,message:error instanceof Error?error.message:'Invalid link list'}}
   return cell
  })
  const rowsByKey=new Map(table.rows.map(r=>[r.key,r]))
  const cardinality=override.cardinality??(cells.every(c=>c.references.length<=1)?'one':'many')
  if(cardinality==='one')for(const cell of cells)if(cell.references.length>1)cell.error={code:'LINK_CARDINALITY',tableKey:table.key,rowKey:cell.rowKey,columnKey:column.key,raw:rowsByKey.get(cell.rowKey)!.values[column.key],location:rowsByKey.get(cell.rowKey)!.location,message:'ONE link contains several references'}
  plans.push({table,column,...(override.derivedFrom?{derivedFrom:override.derivedFrom}:{}),...(targetTableKey!==undefined?{targetTableKey}:{}),cardinality,cells,...(override.reciprocal?{reciprocal:override.reciprocal}:column.reciprocalColumnKey&&targetTableKey?{reciprocal:{tableKey:targetTableKey,columnKey:column.reciprocalColumnKey}}:{})})
 }
 return plans
}
export const canonicalRow=(table:string,row:string)=>JSON.stringify([table,row])
function edges(plan:RelationPlan):Set<string>{return new Set(plan.cells.flatMap(cell=>cell.references.filter(r=>r.state==='resolved'||!!r.selection).map(r=>JSON.stringify([cell.rowKey,r.targetRowKey]))))}
/** Explicit reciprocal identity, or unique opposite targets with reverse-edge evidence. Never labels alone. */
export function canonicalizeReciprocal(plans:RelationPlan[]):ImportDiagnostic[] {
 const diagnostics:ImportDiagnostic[]=declaredProjections(plans)
 for(const plan of plans)if(plan.reciprocal){const partner=plans.find(p=>p.table.key===plan.reciprocal!.tableKey&&p.column.key===plan.reciprocal!.columnKey);if(!partner||partner===plan||partner.targetTableKey!==plan.table.key||plan.targetTableKey!==partner.table.key)throw new ImportInputError(`${plan.table.label}.${plan.column.label}: explicit reciprocal pair must identify a distinct opposite link column`)}
 for(let i=0;i<plans.length;i++){
  const left=plans[i];if(left.inverseOf||left.declaredCanonical)continue
  for(let j=i+1;j<plans.length;j++){
   const right=plans[j];if(right.inverseOf||right.declaredCanonical||left.targetTableKey!==right.table.key||right.targetTableKey!==left.table.key)continue
   const explicitlyPaired=left.reciprocal?.tableKey===right.table.key&&left.reciprocal.columnKey===right.column.key||right.reciprocal?.tableKey===left.table.key&&right.reciprocal.columnKey===left.column.key
   if(left.reciprocal&&!explicitlyPaired||right.reciprocal&&!explicitlyPaired)continue
   const a=edges(left),b=new Set([...edges(right)].map(edge=>{const [x,y]=JSON.parse(edge);return JSON.stringify([y,x])}))
   if(!a.size&&!b.size&&!explicitlyPaired)continue
   const overlap=[...a].some(edge=>b.has(edge))
   const opposite=plans.filter(p=>p!==left&&!p.inverseOf&&p.table.key===left.targetTableKey&&p.targetTableKey===left.table.key)
   const reverseOpposite=plans.filter(p=>p!==right&&!p.inverseOf&&p.table.key===right.targetTableKey&&p.targetTableKey===right.table.key)
   const disagrees=a.size!==b.size||[...a].some(edge=>!b.has(edge))||[left,right].some(p=>p.cells.some(c=>c.error||c.references.some(r=>r.state!=='resolved'&&!r.selection)))
   if(!explicitlyPaired&&(opposite.length!==1||reverseOpposite.length!==1)){
    if(overlap)diagnostics.push({code:'RECIPROCAL_PAIR_AMBIGUOUS',tableKey:left.table.key,columnKey:left.column.key,message:'Several opposite target columns share reverse edges; choose the reciprocal pair explicitly instead of guessing.'})
    continue
   }
   if(!overlap&&!explicitlyPaired){if(disagrees)diagnostics.push({code:'RECIPROCAL_PAIR_REQUIRED',tableKey:left.table.key,columnKey:left.column.key,message:'Opposite target columns have no supporting reverse edges; owner must explicitly identify a reciprocal pair.'});continue}
   if(disagrees){
    const forwardOnly=[...a].filter(edge=>!b.has(edge)),reverseOnly=[...b].filter(edge=>!a.has(edge))
    for(const [plan,edge,side] of [...forwardOnly.map(edge=>[left,edge,'forward'] as const),...reverseOnly.map(edge=>[right,edge,'reverse'] as const)]){
     const [first,second]=JSON.parse(edge),rowKey=side==='forward'?first:second,row=plan.table.rows.find(r=>r.key===rowKey)!
     diagnostics.push({code:'RECIPROCAL_DISAGREEMENT',tableKey:plan.table.key,rowKey,columnKey:plan.column.key,location:row.location,raw:row.values[plan.column.key],message:`${side} reference ${edge} is absent from the other reciprocal column; canonical ONE side (or earlier source column on ties) determines native relation. ${explicitlyPaired?'Explicit owner/API reciprocal identity.':'Unique opposite columns with supporting reverse edges are an explicit inference assumption.'}`})
    }
   }
   const canonical=left.cardinality==='many'&&right.cardinality==='one'?right:left,inverse=canonical===left?right:left
   inverse.inverseOf={tableKey:canonical.table.key,columnKey:canonical.column.key};inverse.inverseDescription=`${explicitlyPaired?'Explicit reciprocal pair. ':'Unique opposite columns with supporting reverse edges: inference assumption. '}Inverse view of ${canonical.table.label}.${canonical.column.label}; ${left.cardinality==='one'&&right.cardinality==='one'?'both ONE: earlier source column chosen (explicit assumption)':left.cardinality==='many'&&right.cardinality==='many'?'both MANY: earlier source column chosen':'ONE side chosen'}`
   diagnostics.push({code:'RECIPROCAL_CANONICAL',tableKey:inverse.table.key,columnKey:inverse.column.key,message:inverse.inverseDescription})
   break
  }
 }
 return diagnostics
}
