import {PortabilityError} from '@runeditrun/rer/modules/portability';
/** Installation data is complete; credentials and automatic dispatch never transfer. */
export const transient = ['Durable Object initialization cache', 'WORK_QUEUE deliveries', 'local caches and logs'];
export const portabilityPolicy = {
 product:'just-every/cradle',
 excludeTables:['record_capacity','record_trash_maintenance',
  'company_identity_config','company_scim_users','company_scim_credentials','company_saml_requests','company_saml_assertions',
  'record_presence',
  'sessions','authority_sessions','authority_magic_tokens','authority_credentials','authority_rate_limits',
  'cradle_base_operators','cradle_base_sessions','connection_credentials','connection_oauth_states',
  'runtime_transfer_credentials','admission_outbox','portability_%',
  'authority_delegations','authority_schema_proposers','record_automation_destinations','record_automation_context','integration_tokens',
  'ik_stages','ik_d1_assertions','ik_d1_publication_fences','ik_d1_staging%',
  'ik_d1_native_staging%','ik_d1_preparation_receipts',
 ],
 derivedTables:['launch_search'],
 // Keep the released secret inventory compatible with older archives. The
 // subscription export transform below nulls sealed_json before any part is emitted.
 secretColumns:{execution_attempts:['sealed_input','reconcile_input'],launch_analysis_requests:['authority_json'],launch_automation_authorities:['principal_json']},
 replaceableTables:['authority_principals','execution_collection_revisions','channel_mail_authority','channel_digest_settings','cradle_restore','cradle_first_run'],
 requiredConfiguration:['OWNER_EMAIL','OWNER_NAME','SESSION_SECRET','SETUP_TOKEN','APP_ORIGIN','AUTH_ORIGIN','MAIL_FROM','MAIL_PROVIDER','CONNECTION_ENCRYPTION_KEY'],
 buckets:{FILES:{}},
 async validateStaged({db,tables,manifest}){
  if(manifest.objects.some(object=>object.bucket==='FILES'&&object.key.startsWith('execution/')))throw new PortabilityError('private_execution_payload',409);
  const files=tables.evidence_files;
  if(files){
   const rows=(await db.prepare('SELECT id,object_key,sha256,bytes FROM "'+files.replaceAll('"','""')+`" WHERE state='available'`).all()).results;
   for(const row of rows){const object=manifest.objects.find(object=>object.bucket==='FILES'&&object.key===row.object_key);
    if(!object||object.size!==row.bytes||object.sha256!==row.sha256)throw new PortabilityError('stored_file_checksum:'+row.id,409);
   }
  }
  if(await db.prepare("SELECT 1 FROM authority_principals WHERE kind<>'system' OR human_id IS NOT NULL OR initial_owner<>0 LIMIT 1").first())return false;
  if(tables.warehouse_exports&&await db.prepare(`SELECT 1 FROM "${tables.warehouse_exports.replaceAll('"','""')}" WHERE state='active' OR running_id IS NOT NULL OR watermark_json<>'{}' LIMIT 1`).first())return false;
  const checks={
   lifecycle_erasures:"state<>'complete'",lifecycle_erasure_blobs:'1',lifecycle_file_writes:'1',
   operators:'active<>0',authority_principals:"initial_owner<>0 OR (kind<>'system' AND state NOT IN ('removed','erased'))",
   record_change_subscriptions:"state<>'inactive' OR sealed_json IS NOT NULL",
   record_sheet_schedules:"state<>'paused' OR running_id IS NOT NULL",
   authority_memberships:"state='active'",authority_grants:'restore_hold<>1',automations:'enabled<>0',automation_runs:"state IN ('Queued','Running','Waiting')",launch_automation_actions:"state IN ('Queued','Pending','Running','Waiting')",
   execution_runs:"state IN ('queued','running','waiting','partial') OR lease_owner IS NOT NULL OR next_wake_at IS NOT NULL",
   execution_attempts:"state IN ('prepared','dispatching') OR next_check_at IS NOT NULL",
   provider_connections:"state<>'unconfigured' OR credential_ref IS NOT NULL OR consent_scopes_json<>'[]'",
   channel_deliveries:"state IN ('held','queued','dispatching')",channel_mail_authority:'active<>0',channel_digest_settings:'enabled<>0',
   ik_jobs:'cradle_restore_hold<>1 OR lease_token IS NOT NULL OR lease_expires IS NOT NULL',
   cradle_restore:'pending<>1 OR current_owner_id IS NOT NULL',
   record_automation_versions:'credential_id IS NOT NULL',record_automation_events:"state<>'complete'",
   integration_deliveries:"state IN ('queued','sending') OR claim IS NOT NULL OR claim_until IS NOT NULL",
  };
  for(const [table,condition]of Object.entries(checks)){
   const staged=tables[table];if(!staged){if(table==='record_change_subscriptions')continue;return false;}
   if(await db.prepare('SELECT 1 FROM "'+staged.replaceAll('"','""')+'" WHERE '+condition+' LIMIT 1').first())return false;
  }
  return true;
 },
 exportRow(table,row){
  if(table==='record_change_subscriptions'){row.state='inactive';row.sealed_json=null;row.delivery_state='restore_hold';}
  if(table==='record_sheet_schedules'){row.state='paused';row.running_id=null;row.last_slot=null;row.last_started_at=null;}
  if(table==='warehouse_exports'){if(row.state!=='removed')row.state='paused';row.running_id=null;row.watermark_json='{}';row.last_slot=null;}
  if(table==='operators')row.active=0;
  if(table==='authority_principals'){if(row.kind!=='system'&&row.state!=='erased')row.state='removed';row.initial_owner=0;}
  if(table==='authority_memberships'){
   row.cradle_restore_active=row.state==='active'?1:row.cradle_restore_active;
   row.state='removed';
  }
  if(table==='authority_grants')row.restore_hold=1;
  if(table==='launch_analysis_requests'){row.authority_json=null;if(['Queued','Running','Unknown'].includes(row.state)){row.state='Failed';row.error_code='forbidden';row.error_message='Restored analyses require a new operator request';}}
  if(table==='launch_automation_authorities')row.principal_json=null;
  if(table==='automations')row.enabled=0;
  if(table==='record_automation_versions')row.credential_id=null;
  if(table==='record_automation_events')row.state='complete';
  if(table==='integration_deliveries'){
   if(row.state==='sending')row.state='uncertain';
   if(row.state==='queued')row.state='rejected';
   row.claim=null;row.claim_until=null;
  }
  if(table==='automation_runs'&&['Queued','Running','Waiting'].includes(row.state))row.state='Cancelled';
  if(table==='launch_automation_actions'&&['Queued','Pending','Running','Waiting'].includes(row.state))row.state='Cancelled';
  if(table==='execution_runs'){
   if(['queued','running','waiting','partial'].includes(row.state))row.state='cancelled';
   row.lease_owner=null;row.lease_expires_at=null;row.next_wake_at=null;
  }
  if(table==='execution_attempts'){
   if(row.state==='dispatching')row.state='unknown';
   if(row.state==='prepared')row.state='refused';
   row.next_check_at=null;
  }
  if(table==='provider_connections'){row.state='unconfigured';row.credential_ref=null;row.consent_scopes_json='[]';}
  if(table==='connection_jobs'){
   if(['queued','running','waiting'].includes(row.state))row.state='failed';
   row.lease_owner=null;row.lease_expires_at=null;
  }
  if(table==='channel_deliveries'){
   if(['held','queued'].includes(row.state))row.state='cancelled';
   if(row.state==='dispatching')row.state='unknown';
  }
  if(table==='channel_mail_authority')row.active=0;
  if(table==='channel_digest_settings')row.enabled=0;
  if(table==='ik_jobs'){row.lease_token=null;row.lease_expires=null;row.cradle_restore_hold=1;}
  if(table==='cradle_restore'){
   if(row.current_owner_id)row.source_owner_id=row.current_owner_id;
   row.current_owner_id=null;row.pending=1;
  }
  return row;
 },
};

/** Installations with the scheduled-export binding keep its retained copies in
 * the same verified archive and erasure checkpoint as canonical files. */
export const installationPortabilityPolicy = warehouse => {if(!warehouse?.get)throw new PortabilityError('missing_bucket:WAREHOUSE',409);return {...portabilityPolicy,buckets:{...portabilityPolicy.buckets,WAREHOUSE:{}}};};
