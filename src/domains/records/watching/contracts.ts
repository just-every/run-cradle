import type {Ref} from '../../../contracts/primitives';
import type {SqlPredicate,SqlMutation,SqlScalar} from '../../admission/ports';
export type WatchChannel='in-app'|'email'|'slack'|'teams'|'nook';
export type WatchTarget={appId:string;entityId:string;recordId?:string;viewId?:string};
export type WatchInput=WatchTarget&{enabled:boolean;mode:'immediate'|'daily';channels:WatchChannel[]};
export type WatchRow={id:string;operator_id:string;principal_id:string;app_id:string;entity_id:string;target_kind:'record'|'view'|'table';target_id:string;source:string;enabled:number;mode:'immediate'|'daily';channels_json:string;version:number;created_at:number;updated_at:number};
export type WatchEffects={guards:SqlPredicate[];mutations:SqlMutation[]};
export type WatchEvent={id:string;event_id:string;operator_id:string;app_id:string;entity_id:string;record_id:string;watch_id:string|null;assignment_field_id:string|null;actor_id:string|null;kind:'field-assigned'|'record-watch';mode:'immediate'|'daily';channels_json:string;title:string;body:string;required_fields_json:string;notification_id:string|null;created_at:number;due_at:number;completed_at:number|null};
export type Assignment={ref:Ref;fieldId:string;fieldLabel:string;recordLabel:string;operatorId:string;eventId:string;actorLabel:string;proposedRow?:Record<string,SqlScalar>};
