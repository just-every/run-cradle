import {hash} from '../evidence/shared.server'
/**
 * Schema facts proven once against sqlite_master or PRAGMA and recorded here, so a scheduled
 * run or a request reads indexed rows instead of scanning the whole schema. A recorded
 * fingerprint is the hash of what generated code expects; any change to that expectation
 * (a new physical revision, a new column) misses the record and is proven again.
 */
export type VerificationKind='physical-columns'|'automation-trigger'|'calendar-capture'
export const fingerprint=(text:string)=>hash(text)
export async function verifiedFingerprints(db:D1Database,kind:VerificationKind){
 const rows=await db.prepare('SELECT name,fingerprint FROM schema_verifications WHERE kind=?').bind(kind).all<{name:string;fingerprint:string}>()
 return new Map(rows.results.map(row=>[row.name,row.fingerprint]))
}
export async function verifiedFingerprint(db:D1Database,kind:VerificationKind,name:string){
 return (await db.prepare('SELECT fingerprint FROM schema_verifications WHERE kind=? AND name=?').bind(kind,name).first<{fingerprint:string}>())?.fingerprint??null
}
export const recordVerification=(db:D1Database,kind:VerificationKind,name:string,value:string)=>
 db.prepare('INSERT INTO schema_verifications(kind,name,fingerprint) VALUES(?,?,?) ON CONFLICT(kind,name) DO UPDATE SET fingerprint=excluded.fingerprint').bind(kind,name,value)
