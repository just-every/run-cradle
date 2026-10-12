import { registerTable } from '../admission/sql.server'
export { runTable,actionTable } from '../../apps/launch/automations.server'
export const automations=registerTable('automations',['id','created_at','updated_at','version','name','trigger_type','trigger_config_json','actions_json','enabled','definition_version','shipped_key'])
export const bindings=registerTable('record_automation_bindings',['automation_id','app_id','entity_id','owner_id'])
export const versions=registerTable('record_automation_versions',['automation_id','definition_version','definition_json','principal_id','credential_id','created_at'])
export const delegationBindings=registerTable('authority_delegations',['principal_id','automation_id'])
export const destinations=registerTable('record_automation_destinations',['id','app_id','owner_id','kind','sealed_json','created_at','revoked_at'])
