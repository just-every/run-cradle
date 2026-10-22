/** Where an operator's identity belongs: rows that reference them by id or are attributed
 * to them. Erasure touches only these places. Any other copy of the name or email refuses
 * before mutation (identity-redaction.server.ts) unless the owner confirms it is kept.
 * - scrub: whole-token name/email rewrites in every text column of the linked rows.
 * - set: identity columns replaced as whole values (operators, Base operator, contexts).
 * - delete: the linked rows are removed (their notifications and mail).
 * `appliedBy` names the module that writes a place's mutation; the rest are generic.
 */
import {STAGING_ENTITY} from '../evidence/staging.server'
import {authIdentityPlaces} from './auth-identity-places'
export type IdentityPerson={id:string;email:string}
export type IdentityPlace={table:string;where:string;values:(person:IdentityPerson)=>string[];action:'scrub'|'set'|'delete';columns?:string[];set?:(label:string,person:IdentityPerson)=>Record<string,string|null>;appliedBy?:string;reason:string}
const byId=(where:string,reason:string,action:IdentityPlace['action']='scrub'):IdentityPlace=>({table:'',where,values:person=>Array.from(where.matchAll(/\?/g),()=>person.id),action,reason})
const place=(table:string,where:string,reason:string)=>({...byId(where,reason),table})
const refs=(column:string)=>`CASE WHEN json_valid(${column}) THEN EXISTS(SELECT 1 FROM json_tree(${column}) WHERE atom=?) ELSE 0 END`
const base='IN (SELECT base_id FROM cradle_base_operators WHERE principal_id=?)'
export const memberIdentityPlaces:IdentityPlace[]=[
 {...byId('id=?','the operator record','set'),table:'operators',columns:['name','email'],appliedBy:'authority/members.server.ts'},
 {...byId(`id ${base}`,'the Base sign-in identity','set'),table:'oa_operators',columns:['display_name','email'],set:(label,person)=>({display_name:label,email:`erased-${person.id}@invalid.invalid`})},
 {...byId('principal_id=? AND erased_at IS NULL','their private AI contexts','set'),table:'evidence_contexts',columns:['content','source_refs','record_refs'],appliedBy:'evidence/member-erasure.server.ts'},
 place('authority_policies','id IN (SELECT policy_id FROM authority_memberships WHERE principal_id=?) AND NOT EXISTS(SELECT 1 FROM authority_memberships m WHERE m.policy_id=authority_policies.id AND m.principal_id<>?)','access policies assigned only to them'),
 place('comments','author_id=?','comments they wrote'),
 place('activity_entries','actor_id=?','activity they performed'),
 place('decisions','requester_id=? OR assignee_id=? OR outcome_by_id=?','decisions they requested, were assigned or decided'),
 place('campaigns','owner_id=? OR health_set_by_id=?','campaigns they own or rated'),
 place('deliverables','owner_id=? OR completed_by_id=?','deliverables they own or completed'),
 place('milestones','owner_id=?','milestones they own'),
 place('risks','owner_id=? OR escalated_by_id=? OR resolved_by_id=?','risks they own, escalated or resolved'),
 place('launch_readiness','owner_id=?','readiness they own'),
 place('lenses','created_by_id=?','lenses they created'),
 place('launch_lens_history','actor_id=?','lens changes they made'),
 place('launch_bulk','actor_id=?','bulk edits they made'),
 place('launch_analysis_requests','actor_id=?','analyses they requested'),
 place('business_decisions','requester_id=? OR assignee_id=? OR decided_by=?','business decisions they requested, were assigned or decided'),
 place('automation_runs','initiated_by_id=?','automation runs they started'),
 place('evidence_comments','author_id=?','evidence comments they wrote'),
 place('evidence_staging','owner_id=?','their private source intake'),
 place('evidence_files',`entity_id='${STAGING_ENTITY}' AND record_id IN (SELECT id FROM evidence_staging WHERE owner_id=?)`,'files in their private source intake'),
 place('manual_base_roles','principal_id=?','their base roles'),
 {...byId('subscription_id IN (SELECT id FROM record_change_subscriptions WHERE owner_id=? OR principal_id=?)','their subscription cursor windows','delete'),table:'record_change_windows'},
 {...byId('owner_id=? OR principal_id=?','their subscriptions and sealed receiver signing secrets','delete'),table:'record_change_subscriptions'},
 {...byId('actor_id=?','trash deletion attribution','set'),table:'record_trash',columns:['actor_id'],set:()=>({actor_id:null})},
 place('record_views','owner_id=?','record views they own'),
 place('record_previews','actor_id=?','record previews they made'),
 place('record_undo','actor_id=?','record undo they made'),
 place('record_sheet_snapshots','actor_id=?','Google Sheets snapshots they imported'),
 place('record_sheet_schedules','owner_id=?','Google Sheets merge schedules they own'),
 place('record_csv_previews','owner_id=?','CSV previews they own'),
 place('portability_previews','actor_id=?','transfer previews they made'),
 place('portability_jobs','actor_id=?','transfers they ran'),
 place('repair_completion_claims','author_id=?','repair completion claims they wrote'),
 place('repair_acceptances','actor_id=?','repair acceptances they gave'),
 place('repair_accounting_mappings','actor_id=?','accountant mappings they configured'),
 place('repair_slot_agreements','actor_id=?','repair slot agreements they made'),
 place('operation_recovery_reviews','assignee_id=?','recovery reviews assigned to them'),
 place('operation_configurations','adopted_by=?','configurations they adopted'),
 ...['intelligence_explorations','intelligence_investigations','intelligence_problems','intelligence_snapshots','intelligence_strategies','knowledge_procedures','manual_record_bases','manual_record_previews','manual_record_releases'].map(table=>place(table,'owner_id=?',`${table.replaceAll('_',' ')} they own`)),
 place('record_schema_proposals','issuer_id=? OR decided_by=?','agent proposals they issued keys for or decided'),
 place('authority_schema_proposers','issuer_id=?','proposing keys they issued'),
 place('sample_installations','installed_by_id=?','sample data they installed'),
 place('execution_runs',`json_extract(actor_json,'$.id')=?`,'runs they started'),
 place('execution_receipts',`method='human_evidence' AND json_extract(result_json,'$.humanResolution.actorId')=?`,'effect resolutions they recorded'),
 place('command_admissions',`actor_id=? OR ${refs('result_json')}`,'commands they issued or that name them as the result'),
 place('admission_audit',`actor_id=? OR ${refs('subject_json')} OR ${refs('changes_json')} OR ${refs('personal_refs_json')}`,'audit entries they acted in or that reference them'),
 place('admission_events',`${refs('subject_json')} OR ${refs('payload_json')}`,'events that reference them'),
 place('admission_outbox',`${refs('input_json')} OR ${refs('subject_json')}`,'queued commands that reference them'),
 // Order matters for deletes: reads and deliveries before their notifications.
 {...byId('operator_id=?','their notification reads','delete'),table:'notification_reads'},
 {...byId('operator_id=?','their notification deliveries','delete'),table:'channel_deliveries'},
 {...byId('operator_id=?','their notifications','delete'),table:'notifications'},
 {...byId('operator_id=?','their notification preferences','delete'),table:'channel_preferences'},
 ...authIdentityPlaces,
 {table:'rer_mail_development_outbox',where:`CASE WHEN json_valid(message) THEN EXISTS(SELECT 1 FROM json_tree(message,'$.to') WHERE type='text' AND (atom=? OR substr(atom,-length(?)-2)=('<'||?||'>'))) ELSE 0 END`,values:person=>[person.email,person.email,person.email],action:'delete',reason:'development mail addressed to them'},
]
/** Columns that hold another person's identity: a copy there is never this person's. */
export const personIdentityColumns=new Set(['operators.name','operators.email','oa_operators.display_name','oa_operators.email','repair_contractors.name','repair_contractors.email','oc_owner_claims.email'])
