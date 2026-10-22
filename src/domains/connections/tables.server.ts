import { registerTable } from '../admission/sql.server';
export const connectionsTable=registerTable('provider_connections',['id','app_id','adapter_id','name','state','account_id','scopes_json','ownership_json','credential_ref','consent_scopes_json','control_epoch','version','last_checked_at','last_sync_at','revoked_at','remote_revocation_state','owner_id','created_at','updated_at']);
export const credentialsTable=registerTable('connection_credentials',['connection_id','sealed_json','expires_at','version','refresh_owner','refresh_expires_at','created_at','updated_at']);
export const oauthTable=registerTable('connection_oauth_states',['id','connection_id','actor_id','session_id','provider','state_hash','verifier_sealed','redirect_uri','return_to','connection_epoch','expires_at','consumed_at','created_at']);
export const webhooksTable=registerTable('connection_webhooks',['id','connection_id','provider_event_id','body_hash','received_at']);
export const checkpointsTable=registerTable('connection_mailbox_checkpoints',['connection_id','scope_hash','page_token','observed_at','version']);
