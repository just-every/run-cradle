import {isStoreReferenceMember} from '../store-references'
import {sourceRecordMapState} from './source-record-map'
import type { ImportStatus, PreparedSource, PlannedRecord, ImportIdentities, ColumnAccounting } from './contracts'
import type { Json } from '../../../../vendor/base/modules/import-kit/src/types'

export const RECEIPT_CHOICES=['rebuild in Cradle','keep in the source','not needed'] as const
/** Fixed statements about what Cradle's importer does not carry, whatever the source held. */
export const NOT_CARRIED=[
 {id:'views',statement:'Cradle\'s importer does not carry source views, interfaces or dashboards. A CSV set holds rows of one view only.'},
 {id:'automations',statement:'Cradle\'s importer does not carry source automations, and import writes start none of Cradle\'s.'},
 {id:'permissions',statement:'Cradle\'s importer does not carry source permissions, sharing or collaborators as access; collaborator names stay text.'},
 {id:'history',statement:'Cradle\'s importer does not carry source comments or record history.'},
 {id:'attachments',statement:'Cradle\'s importer does not carry attachment bytes. Skipped attachment cells are listed in the manifest with their source text.'},
 {id:'buttons',statement:'Cradle\'s importer does not carry button actions.'},
 {id:'formulas',statement:'Cradle\'s importer does not carry formula or rollup definitions; their exported values import as plain text or numbers.'},
] as const
/** What each exit keeps, drawn from RECORDS-006, importing.md and installation-archives.md. */
export const EXITS=[
 {format:'Base JSON',preserves:'One base: tables, fields, select choices, links and lookups, records with their IDs, saved views and forms. No people, access, history, jobs or source files.'},
 {format:'Records CSV set',preserves:'Every table and field of one base as text, with links as primary values; with its correspondence file a return keeps every record and link. No views, forms or source files.'},
 {format:'Per-view CSV',preserves:'Only the current view\'s rows and visible fields, in its order, for the equivalent-table CSV import.'},
 {format:'Whole-installation archive',preserves:'The whole installation database and files; automations return disabled, queued work cancelled, credentials and sessions are not carried.'},
] as const
export const ROUND_TRIP_NOTE='A record round trip through base JSON or CSV is not a whole-business restore; only a whole-installation archive restores the installation.'
const declaredKinds=new Set(['formula','rollup','multipleAttachments','attachment','button','multipleSelects'])
export const isAttachmentColumn=(column:ColumnAccounting)=>['multipleAttachments','attachment'].includes(column.sourceKind??column.sourceType??'')&&column.chosenType==='skipped'
export type ReceiptInput={status:ImportStatus;source:PreparedSource;records:PlannedRecord[];identities:ImportIdentities;baseName:string;reviewedAt:string;generatedAt:string;
 files:{name:string;size:number;sha256:string}[];pendingByEntity:Map<string,{records:number;linkCells:number}>}
const text=(value:Json|undefined)=>value===undefined||value===null?'':typeof value==='string'?value:JSON.stringify(value)
function stateOf(state:string){return state==='completed'?'applied':state==='undone'||state==='rolled_back'?'undone':state==='failed'?'failed':'partial'}
export function buildReceipt(input:ReceiptInput){
 const {status,source,records}=input,report=status.report,planned=new Set(records.map(r=>r.tableKey+'\u0000'+r.rowKey))
 const tables=report.tables.map(table=>{
  const sourceTable=source.tables.find(t=>t.key===table.tableKey),primary=sourceTable?.primaryColumnKey??table.primaryColumnKey
  const rejectedRows=(sourceTable?.rows??[]).filter(row=>!planned.has(table.tableKey+'\u0000'+row.key))
  const label=(key:string)=>table.columns.find(c=>c.columnKey===key)?.label??key
  const entityId=input.identities.tables[table.tableKey]?.entityId,pending=entityId?input.pendingByEntity.get(entityId):undefined
  return {tableKey:table.tableKey,label:table.label,sourceFiles:[...new Set((sourceTable?.rows??[]).map(r=>r.location.artifact))],rowsRead:table.rowsRead,created:table.created,rejected:table.rejected,
   rejections:rejectedRows.map(row=>({row:Number(row.key.replace(/^row-/,''))||row.key,sourceLine:row.location.row,primary:text(row.values[primary]),
    reasons:report.diagnostics.filter(d=>d.tableKey===table.tableKey&&d.rowKey===row.key).map(d=>({code:d.code,column:d.columnKey?label(d.columnKey):undefined,message:d.message}))})),
   links:table.links.map(link=>({column:label(link.columnKey),referencesRead:link.referencesRead,resolved:link.resolved,unresolved:link.unresolved,ambiguous:link.ambiguous})),
   declaredColumns:table.columns.filter(c=>declaredKinds.has(c.sourceKind??c.sourceType??'')).map(c=>({column:c.label,columnKey:c.columnKey,declaredAs:c.sourceKind??c.sourceType!,
    declaredBy:c.sourceKindOrigin??(c.sourceKind?'owner':'recorded'),importedAs:c.chosenType,nonempty:c.nonempty??null,skipped:c.skippedNonempty,converted:c.converted,keptAsText:c.keptText??0,
    ...(isAttachmentColumn(c)?{attachmentManifest:true}:{})})),
   ...(pending&&(pending.records||pending.linkCells)?{notYetApplied:pending}:{})}
 })
 const undo=status.reversal,mapState=sourceRecordMapState(status,source)
 return {format:'cradle-move-in-receipt',version:1,generatedAt:input.generatedAt,
  job:{id:status.job.id,state:stateOf(status.job.state),jobState:status.job.state,stateAsOf:input.generatedAt,reviewedAt:input.reviewedAt,baseName:input.baseName,appId:status.job.destination},
  source:{kind:source.format,statement:'The source was a file set the owner supplied to Cradle. This receipt makes no claim about any live source account.',files:input.files},
  tables,
  sourceRecordMap:{...mapState,recordCount:mapState.available?records.length:0},
  storeReferences:records.flatMap(row=>Object.entries(row.fields).flatMap(([fieldId,value])=>Array.isArray(value)?value.filter(isStoreReferenceMember).map(member=>({tableKey:row.tableKey,rowKey:row.rowKey,fieldId,state:'unresolved' as const,...member.reference.portable})):[])),
  ...(status.progress?{progress:status.progress}:{}),
  reconciliation:{ok:status.reconciliation.ok,missing:status.reconciliation.missing.length,duplicate:status.reconciliation.duplicate.length,extra:status.reconciliation.extra.length,mismatched:status.reconciliation.mismatched.length},
  ...(undo?{undo:{terminal:undo.terminal,reversed:undo.reversed,retained:undo.retained,remaining:undo.remaining,conflicts:undo.conflicts.length}}:{}),
  notCarried:NOT_CARRIED.map(line=>({...line,choices:[...RECEIPT_CHOICES]})),
  exits:[...EXITS],roundTripNote:ROUND_TRIP_NOTE}
}
export type MoveInReceipt=ReturnType<typeof buildReceipt>
