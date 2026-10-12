import type { BasePreview,ImportReport,ImportDiagnostic,ColumnAccounting } from './contracts'
import type { LookupCandidate } from './lookup-proof'
import type { Json } from '../../../../vendor/base/modules/import-kit/src/types'
export type ColumnPreview=ColumnAccounting&{proposedType:string;sourceType?:string;nonempty:number;samples:{rowKey:string;raw:Json;converted?:Json;error?:string}[];skipReason?:string;relationTarget?:string;options?:string[];sourceOptions?:string[];unusedSourceOptions?:string[];lookupCandidates?:LookupCandidate[]}
export type ReviewFlags={loss:boolean;rejected:boolean;unresolved:boolean;ambiguous:boolean}
export type DetailedPreview=BasePreview&{acknowledgments:ReviewFlags;columnPreviews:Record<string,ColumnPreview[]>;inverseViews:{tableKey:string;columnKey:string;canonicalTableKey:string;canonicalColumnKey:string;description:string}[]}
export function acknowledgmentFlags(report:ImportReport):ReviewFlags {
 return {loss:report.lookups.some(lookup=>lookup.recognized)||report.tables.some(t=>t.columns.some(c=>c.skippedNonempty>0||c.converted>0))||report.diagnostics.some(d=>['SOURCE_TYPE_MAPPING','COLUMN_SKIPPED','LOOKUP_MISMATCH','TARGET_ROW_REJECTED','UNSUPPORTED_SOURCE_FIELD','LINK_TARGET_REQUIRED','RECIPROCAL_DISAGREEMENT','RECIPROCAL_PAIR_REQUIRED','RECIPROCAL_PAIR_AMBIGUOUS','FIELD_LABEL_MAPPING'].includes(d.code)),rejected:report.tables.some(t=>t.rejected>0),unresolved:report.tables.some(t=>t.links.some(l=>l.unresolved>0)),ambiguous:report.tables.some(t=>t.links.some(l=>l.ambiguous>0))||report.diagnostics.some(d=>d.code==='LOOKUP_CANDIDATE_AMBIGUOUS')}
}
export function reportJson(preview:BasePreview):string{return JSON.stringify(preview.report,null,2)}
export function diagnostic(code:string,message:string,tableKey:string,rowKey?:string,columnKey?:string):ImportDiagnostic{return {code,message,tableKey,...(rowKey?{rowKey}:{}),...(columnKey?{columnKey}:{})}}
