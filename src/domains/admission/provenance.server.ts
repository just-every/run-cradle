import { canonical } from './canonical';
import { digest } from './digest';
import { AdmissionError } from './errors';
import type { ReplayProvenance } from './service.server';
export const SEGMENT_BYTES=200000;
type Manifest=Omit<ReplayProvenance,'subjects'>&{format:'segmented-v1';subjectCount:number;segments:{count:number;sha256:string}[]};
export function encodeProvenance(provenance:ReplayProvenance):{header:string;segments:string[]}{
 const inline=canonical(provenance);if(new TextEncoder().encode(inline).byteLength<=SEGMENT_BYTES)return {header:inline,segments:[]};
 const segments:string[]=[];let current:ReplayProvenance['subjects']=[],bytes=2;
 for(const subject of provenance.subjects){const size=new TextEncoder().encode(canonical(subject)).byteLength+1;if(size>SEGMENT_BYTES)throw new AdmissionError('capacity_limit','Single provenance subject exceeds segment size');if(current.length&&bytes+size>SEGMENT_BYTES){segments.push(canonical(current));current=[];bytes=2;}current.push(subject);bytes+=size;}if(current.length)segments.push(canonical(current));
 const {subjects,...authority}=provenance;const manifest:Manifest={...authority,format:'segmented-v1',subjectCount:subjects.length,segments:segments.map(value=>({count:JSON.parse(value).length,sha256:digest(value)}))};return {header:canonical(manifest),segments};
}
function valid(value:unknown):value is ReplayProvenance{if(!value||typeof value!=='object')return false;const p=value as ReplayProvenance;return Number.isSafeInteger(p.policyVersion)&&(p.grantId===null||typeof p.grantId==='string')&&(p.grantVersion===null||Number.isSafeInteger(p.grantVersion))&&Array.isArray(p.subjects)&&p.subjects.every(s=>s&&s.ref&&['appId','entityId','recordId'].every(k=>typeof(s.ref as unknown as Record<string,unknown>)[k]==='string')&&Array.isArray(s.fieldIds)&&s.fieldIds.every(id=>typeof id==='string'));}
export async function loadProvenance(db:D1Database,commandId:string,header:string):Promise<ReplayProvenance>{
 try{const value=JSON.parse(header);if(value.format===undefined){if(!valid(value))throw new Error('Invalid legacy provenance');return value;}
 if(value.format!=='segmented-v1'||!Array.isArray(value.segments)||!Number.isSafeInteger(value.subjectCount)||value.subjectCount<1)throw new Error('Invalid manifest');
 const rows=await db.prepare('SELECT segment_index,subjects_json FROM admission_provenance_segments WHERE command_id=? ORDER BY segment_index').bind(commandId).all<{segment_index:number;subjects_json:string}>();if(rows.results.length!==value.segments.length)throw new Error('Incomplete provenance');const subjects:ReplayProvenance['subjects']=[];
 for(let i=0;i<rows.results.length;i++){const row=rows.results[i]!,expected=value.segments[i];if(row.segment_index!==i||digest(row.subjects_json)!==expected.sha256)throw new Error('Provenance integrity mismatch');const part=JSON.parse(row.subjects_json);if(!Array.isArray(part)||part.length!==expected.count)throw new Error('Provenance count mismatch');subjects.push(...part);}
 const result={policyVersion:value.policyVersion,grantId:value.grantId,grantVersion:value.grantVersion,subjects};if(subjects.length!==value.subjectCount||!valid(result))throw new Error('Invalid provenance');return result;
 }catch{throw new AdmissionError('forbidden','Stored command provenance is incomplete or invalid');}
}
