import type { RequestContext,PolicyPort } from '../authority/ports';
import { digest } from '../construction/source';
/** Numeric schemaVersion identifies the adopted schema graph; controlEpoch fences the active source routing. */
export function releaseContext(db:D1Database,policy:PolicyPort){return async(ctx:RequestContext,appId:string):Promise<{releaseId:string;schemaVersion:number;controlEpoch:number}>=>{
 await policy.authorize(ctx,{appId,action:'candidate.read',expected:[],cost:[],inputHash:await digest(appId)});
 const live=await db.prepare('SELECT release_id,schema_version,control_epoch FROM live_app_releases WHERE app_id=?').bind(appId).first<{release_id:string;schema_version:number|null;control_epoch:number|null}>();
 if(live){if(live.schema_version===null||live.control_epoch===null)throw new Error('release_context_migration_required');return{releaseId:live.release_id,schemaVersion:live.schema_version,controlEpoch:live.control_epoch};}
 const pending=await db.prepare("SELECT construction_release_id,schema_version,control_epoch FROM construction_applications WHERE id=? AND state IN ('pending','stopped')").bind(appId).first<{construction_release_id:string|null;schema_version:number|null;control_epoch:number|null}>();
 if(!pending?.construction_release_id||pending.schema_version===null||pending.control_epoch===null)throw new Error('application_release_context_unconfigured');return{releaseId:pending.construction_release_id,schemaVersion:pending.schema_version,controlEpoch:pending.control_epoch};
};}
