import {registerTable} from '../admission/sql.server'
export const subscriptions=registerTable('record_change_subscriptions',['id','app_id','entity_id','view_id','principal_id','credential_id','owner_id','sealed_json','created_at','expires_at','state','last_sequence','delivery_state'])
export const windows=registerTable('record_change_windows',['cursor_hash','subscription_id','through_sequence','captured_at'])
export type Subscription={id:string;app_id:string;entity_id:string|null;view_id:string|null;principal_id:string;credential_id:string;owner_id:string;sealed_json:string|null;created_at:number;expires_at:number;state:string;last_sequence:number;delivery_state:string}
export type Change={id:string;change_sequence:number;action:string;subject_json:string;changes_json:string;created_at:string}
export const retentionMs=30*86400000
export const lifetimeMs=7*86400000
