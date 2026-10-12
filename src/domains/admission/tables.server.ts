import { registerTable } from './sql.server';
export const commandTable = registerTable('command_admissions', ['command_id', 'batch_nonce', 'actor_id', 'actor_kind', 'app_id', 'action', 'input_hash', 'state', 'result_json', 'access_json', 'created_at', 'updated_at']);
export const auditTable = registerTable('admission_audit', ['id', 'command_id', 'actor_id', 'actor_kind', 'app_id', 'action', 'subject_json', 'changes_json', 'source_ids_json', 'personal_refs_json', 'created_at']);
export const eventTable = registerTable('admission_events', ['id', 'command_id', 'app_id', 'name', 'version', 'subject_json', 'payload_json', 'cause_run_ids_json', 'created_at']);
export const outboxTable = registerTable('admission_outbox', ['id', 'command_id', 'app_id', 'action', 'version', 'input_json', 'not_before', 'grant_id', 'subject_json', 'source_release_id', 'cause_run_ids_json', 'state', 'created_at', 'updated_at']);

export const provenanceTable=registerTable('admission_provenance_segments',['command_id','segment_index','subjects_json']);
