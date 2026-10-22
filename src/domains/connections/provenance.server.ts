import type { RequestContext,PolicyPort } from '../authority/ports';
import { sha256 } from '../../adapters/crypto.server';
import { ApiError } from '../../core/registry/errors';
/** Reads actual source provenance after connection visibility; requires no construction permission. */
export function connectionRelease(db:D1Database,policy:PolicyPort){return async(ctx:RequestContext,appId:string)=>{
 await policy.authorize(ctx,{appId,action:'connection.read',expected:[],cost:[],inputHash:await sha256(appId)});
 const live=await db.prepare('SELECT release_id FROM live_app_releases WHERE app_id=?').bind(appId).first<{release_id:string}>();if(live)return live.release_id;
 const manual=await db.prepare('SELECT b.release_id FROM manual_record_bases b JOIN manual_record_releases r ON r.id=b.release_id AND r.app_id=b.id WHERE b.id=?').bind(appId).first<{release_id:string}>();if(manual)return manual.release_id;
 const installed=await db.prepare("SELECT construction_release_id FROM construction_applications WHERE id=? AND state IN ('pending','stopped')").bind(appId).first<{construction_release_id:string|null}>();if(installed?.construction_release_id)return installed.construction_release_id;
 throw new ApiError('unconfigured','Application source release provenance has not been configured.');
};}
