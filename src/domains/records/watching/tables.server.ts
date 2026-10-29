import {registerTable} from '../../admission/sql.server';
export const watches=registerTable('record_watches',['id','operator_id','principal_id','app_id','entity_id','target_kind','target_id','source','enabled','mode','channels_json','version','created_at','updated_at']);
export const watchEvents=registerTable('record_watch_events',['id','event_id','operator_id','app_id','entity_id','record_id','watch_id','assignment_field_id','actor_id','kind','mode','channels_json','title','body','required_fields_json','notification_id','created_at','due_at','completed_at']);
export const chatDeliveries=registerTable('record_watch_chat_deliveries',['id','notification_id','operator_id','provider','state','created_at','updated_at','provider_receipt']);
