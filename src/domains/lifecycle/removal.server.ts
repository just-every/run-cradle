import {effects,updateRows,removeRows} from './changes.server'
import {AuthorityError} from '../authority/errors'
export const prepareLifecycleRemoval=(db:D1Database)=>async(ctx:{now:string},id:string)=>{const change=effects()
  await removeRows(db,change,'connection_credentials','connection_id IN (SELECT id FROM provider_connections WHERE owner_id=?)',[id])
  await updateRows(db,change,'provider_connections',{state:'revoked',revoked_at:ctx.now,share_previews:0,updated_at:ctx.now},'owner_id=? AND revoked_at IS NULL',[id])
  await updateRows(db,change,'launch_readiness',{state:'Cancelled',updated_at:Date.parse(ctx.now)},"owner_id=? AND state='Outstanding'",[id])
  await updateRows(db,change,'channel_deliveries',{state:'cancelled',updated_at:Date.parse(ctx.now)},"operator_id=? AND state IN ('held','queued','muted')",[id])
  await updateRows(db,change,'oa_sessions',{revoked_at:Date.parse(ctx.now)},'operator_id IN (SELECT base_id FROM cradle_base_operators WHERE principal_id=?) AND revoked_at IS NULL',[id])
  const base=await db.prepare('SELECT o.id,o.role,o.status,o.version FROM oa_operators o JOIN cradle_base_operators p ON p.base_id=o.id WHERE p.principal_id=?').bind(id).first<{id:string;role:string;status:string;version:number}>()
  if(base&&['active','invited'].includes(base.status)){
   if(base.role==='owner'&&base.status==='active'&&!await db.prepare("SELECT 1 FROM oa_operators WHERE id<>? AND role='owner' AND status='active' LIMIT 1").bind(base.id).first())throw new AuthorityError('version_conflict','Base requires another active installation owner before removing this owner.',409)
   await updateRows(db,change,'oa_operators',{status:'inactive'},'id=? AND version=?',[base.id,base.version])
   return {...change,blockers:[],principalProjected:true}
  }
  return {...change,blockers:[]}
 }
