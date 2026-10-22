import {registerTable} from '../../admission/sql.server'
export const trashTable=registerTable('record_trash',['app_id','entity_id','record_id','group_id','actor_id','deleted_at','expires_at','record_version','schema_version','prior_lifecycle','links_json','purge_state'])
export const trashLifetime=30*86400000
export type TrashRow={app_id:string;entity_id:string;record_id:string;group_id:string;actor_id:string|null;deleted_at:number;expires_at:number;record_version:number;schema_version:number;prior_lifecycle:string;links_json:string;purge_state:string}
