import { registerTable, trustedPredicate } from '../../admission/sql.server'
import type { SqlPredicate } from '../../admission/ports'
import { AdmissionError } from '../../admission/errors'
import { assertGuards } from '../fence.server'
import type { StoredPreview } from './release.server'
import type { SchemaImpact } from './contracts'
import type { AgentImpact, AgentProposal, OwnerProposal, ProposalState, ProposalSummary, ProposedForm, ProposedView } from './proposal-contracts'

export const proposals=registerTable('record_schema_proposals',['id','app_id','proposer_id','credential_id','issuer_id','state','summary','detail_json','preview_hash','note','release_id','decided_by','created_at','expires_at','decided_at'])
/** A stored proposal: its preview, what it adds, and the fences that make it current. */
export type StoredProposal=StoredPreview & {calculationReportVersion?:1;views:ProposedView[];forms:ProposedForm[];note:string;metadata:string[];freshness:SqlPredicate[]}
/** Old retained proposals keep their original hash; new reports are part of the reviewed commitment. */
export const proposalCommitment=(d:StoredProposal)=>({schemas:d.schemas,impacts:d.impacts,metadata:d.metadata,views:d.views,forms:d.forms,note:d.note,...(d.calculationReportVersion===1?{calculations:d.calculations??[]}: {})})
export type ProposalRow={id:string;app_id:string;proposer_id:string;credential_id:string;issuer_id:string;state:'pending'|'adopted'|'declined'|'withdrawn';summary:string;detail_json:string;preview_hash:string;note:string|null;release_id:string|null;created_at:string;expires_at:string;key_name:string|null;base_name:string|null;key_current:number}
const select=`SELECT p.*,b.label AS key_name,base.name AS base_name,
 CASE WHEN b.revoked_at IS NULL AND c.revoked_at IS NULL AND c.expires_at>unixepoch('subsec')*1000 THEN 1 ELSE 0 END AS key_current
 FROM record_schema_proposals p LEFT JOIN authority_schema_proposers b ON b.principal_id=p.proposer_id
 LEFT JOIN authority_credentials c ON c.id=p.credential_id LEFT JOIN manual_record_bases base ON base.id=p.app_id`

const agentImpact=({entityId,label,changes,count,removedFields,deletedTable,validationViolations,violatingRecordCount}:SchemaImpact):AgentImpact=>({entityId,label,changes,count,removedFields,...(deletedTable===undefined?{}:{deletedTable}),
 ...(validationViolations?{validationViolations:validationViolations.map(({ruleId,ruleName,message,count})=>({ruleId,ruleName,message,count}))}:{}),...(violatingRecordCount===undefined?{}:{violatingRecordCount})})
export const parseStored=(row:Pick<ProposalRow,'detail_json'>)=>{const detail=JSON.parse(row.detail_json) as StoredProposal;const wrap=(g:SqlPredicate)=>trustedPredicate(g.sql,g.values);return {...detail,guards:detail.guards.map(wrap),freshness:detail.freshness.map(wrap)}}
export function createProposalStore(db:D1Database){
 async function state(row:ProposalRow,now:string):Promise<ProposalState>{
  if(row.state!=='pending')return row.state
  if(row.expires_at<=now)return 'stale'
  try{await assertGuards(db,parseStored(row).freshness);return 'pending'}catch(error){if(error instanceof AdmissionError&&error.code==='version_conflict')return 'stale';throw error}
 }
 async function summary(row:ProposalRow,now:string):Promise<ProposalSummary>{
  const detail=JSON.parse(row.detail_json) as StoredProposal,declined=row.state==='declined'
  return {id:row.id,appId:row.app_id,baseName:row.base_name??detail.name,keyName:row.key_name??'Removed key',createdAt:row.created_at,expiresAt:row.expires_at,summary:row.summary,state:await state(row,now),keyCurrent:row.key_current===1,note:detail.note,declineNote:declined?row.note??'':null,releaseId:row.release_id}
 }
 return {
  summary,
  async list(where:'issuer_id'|'proposer_id',id:string,now:string){const rows=(await db.prepare(`${select} WHERE p.${where}=? ORDER BY p.created_at DESC,p.id DESC LIMIT 50`).bind(id).all<ProposalRow>()).results;return Promise.all(rows.map(row=>summary(row,now)))},
  async row(where:'issuer_id'|'proposer_id',id:string,proposalId:string){const row=await db.prepare(`${select} WHERE p.id=? AND p.${where}=?`).bind(proposalId,id).first<ProposalRow>();if(!row)throw new AdmissionError('not_found','Proposal not found.');return row},
  async owner(row:ProposalRow,now:string):Promise<OwnerProposal>{const d=parseStored(row);return {...await summary(row,now),previewHash:row.preview_hash,schemas:d.schemas,calculations:d.calculations??[],impacts:d.impacts,metadata:d.metadata,views:d.views,forms:d.forms,access:d.access,recovery:d.recovery}},
  /** The agent sees counts and labels it proposed, never record identities or values. */
  async agent(row:ProposalRow,now:string):Promise<AgentProposal>{const d=parseStored(row);return {...await summary(row,now),previewHash:row.preview_hash,impacts:d.impacts.map(agentImpact),metadata:d.metadata,views:d.views,forms:d.forms,access:d.access}},
 }
}
