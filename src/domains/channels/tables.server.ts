import { registerTable } from '../admission/sql.server'
export const notifications=registerTable('notifications',['id','created_at','updated_at','version','operator_id','kind','subject_id','title','body','unavailable'])
export const reads=registerTable('notification_reads',['id','created_at','updated_at','version','notification_id','operator_id','read_at'])
export const metadata=registerTable('channel_notifications',['notification_id','app_id','campaign_id','subject_type','event_kind','last_event_at','failure'])
export const events=registerTable('channel_events',['event_id','operator_id','notification_id'])
export const deliveries=registerTable('channel_deliveries',['id','notification_id','operator_id','campaign_id','kind','state','due_at','created_at','updated_at','version','run_id','automation_run_id','attempt_id','receipt_id','provider_id','error_code','error_message','attempts','group_id','schedule_key','first_failure_at'])
export const preferences=registerTable('channel_preferences',['operator_id','version','updated_at','timezone','muted_json','digest_enabled','progress_enabled'])
export const digestSettings=registerTable('channel_digest_settings',['id','enabled','recipients_json','version','updated_at'])
