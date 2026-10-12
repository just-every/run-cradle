import type {Id,Instant,Versioned,CellValue} from '../../contracts/primitives';
export type ArchiveJob=Versioned & {kind:'export'|'restore'|'erasure';state:'queued'|'running'|'complete'|'failed';percent:number|null;manifestFileId:Id|null;errors:string[];checksumsVerified:boolean;equivalent:boolean|null};
export type ImportPreviewRow={row:number;key:string;id:Id;values:Record<Id,CellValue>;before:Record<Id,CellValue>;fingerprint:string;operation:'create'|'update'|'unchanged'};
export type ImportPreview={id:Id;token:Id;state:'valid'|'invalid'|'stale'|'expired';expiresAt:Instant;creates:number;updates:number;unchanged:number;errors:{row:number;message:string}[]};
export type ImportPreviewPage=ImportPreview & {rows:ImportPreviewRow[];nextCursor:string|null;total:number};
export type ImportCommitted={id:Id;rows:number};
