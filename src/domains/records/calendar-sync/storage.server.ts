import {registerTable} from '../../admission/sql.server'
export const definitions=registerTable('record_calendar_definitions',['id','app_id','entity_id','owner_id','connection_id','calendar_id','definition_json','actor_json','enabled','version','created_at','updated_at'])
export const versions=registerTable('record_calendar_versions',['id','definition_id','definition_version','definition_json','created_at','updated_at'])
export const events=registerTable('record_calendar_events',['id','definition_id','record_id','generation','event_id','etag','state','attempt_id','review_json','last_record_version','created_at','updated_at'])
export type Definition={id:string;app_id:string;entity_id:string;owner_id:string;connection_id:string;calendar_id:string;definition_json:string;actor_json:string;enabled:number;version:number;created_at:string;updated_at:string}
export type Event={id:string;definition_id:string;record_id:string;generation:number;event_id:string|null;etag:string|null;state:string;attempt_id:string|null;review_json:string|null;last_record_version:number|null;created_at:string;updated_at:string}

export const changes=registerTable('record_calendar_changes',['id','definition_id','record_id','command_id','state','created_at','updated_at'])
