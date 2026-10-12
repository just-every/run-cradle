import {registerTable,trustedPredicate} from '../admission/sql.server';
export const releaseStops=registerTable('operation_release_stops',['release_id','app_id','reason','created_at','command_id']);
/** Integrate at every admission boundary that permits work against a selected release. */
export const operationReleaseGuard=(releaseId:string)=>trustedPredicate('NOT EXISTS(SELECT 1 FROM operation_release_stops WHERE release_id=?)',[releaseId]);
