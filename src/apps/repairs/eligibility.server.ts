import {trustedPredicate} from '../../domains/admission/sql.server';
import {AdmissionError} from '../../domains/admission/errors';
import type {RepairWorkContext} from './context.server';
import {retainCaseEvidence} from './case-evidence.server';
import {str,type Row} from './repository.server';
export async function eligible(c:RepairWorkContext,work:Row,contractor:Row){
 const asset=await c.repo.load(c.ctx,'assets',str(work,'asset_id')),store=await c.repo.load(c.ctx,'stores',str(work,'store_id'));
 if(contractor.active!==1||asset.active!==1||store.active!==1)throw new AdmissionError('invalid_transition','Asset, store and contractor must be active');
 if(asset.store_id!==store.id)throw new AdmissionError('invalid_transition','The asset moved stores; review the current repair identity before selecting a contractor');
 c.guards.push(c.repo.version('contractors',contractor),c.repo.version('assets',asset),c.repo.version('stores',store));
 const checked:Row[]=[];
 for(const kind of ['licence','insurance']){
  const rows=await c.repo.list(c.ctx,'credentials',trustedPredicate('contractor_id=? AND kind=? AND trade=? AND location=? AND active=1 AND valid_from<=? AND valid_until>?',[contractor.id,kind,str(asset,'trade'),str(store,'location'),c.ctx.now,c.ctx.now]));
  const credential=rows[0];if(!credential)throw new AdmissionError('invalid_transition',`Current ${kind}, trade and location evidence is required`);
  await c.evidence([{sourceId:str(credential,'source_id'),sourceVersion:Number(credential.source_version),locator:{kind:'field',path:'credential'},observedAt:c.ctx.now}]);
  await retainCaseEvidence(c,[str(credential,'source_id')]);
  checked.push(credential);
  c.unexpired(str(credential,'valid_until'));c.guards.push(c.repo.version('credentials',credential),trustedPredicate('EXISTS(SELECT 1 FROM repair_credentials WHERE id=? AND active=1 AND valid_from<=? AND valid_until>?)',[credential.id,c.ctx.now,c.ctx.now]));
 }
 return checked;
}
