import type {RequestContext} from '../../domains/authority/ports';
import type {Ref} from '../../contracts/primitives';
import {AdmissionError} from '../../domains/admission/errors';
import {trustedPredicate} from '../../domains/admission/sql.server';
import type {RepairDependencies} from './ports';
import {createRepairRepository,str} from './repository.server';
import {REPAIRS_APP_ID,REPAIR_ENTITIES,repairRef,repairFieldId} from './model';
/** E capture/upload ownership comes from a real known store/asset and its protected policy, never a fabricated draft. */
export function resolveRepairCapture(d:Pick<RepairDependencies,'db'|'policy'>){return async(ctx:RequestContext,appId:string,subject:Ref|undefined,_kind:'source'|'file')=>{if(appId!==REPAIRS_APP_ID)throw new AdmissionError('not_found','Repair app not found');const repo=createRepairRepository(d);if(!subject){const staff=await repo.list(ctx,'staff',trustedPredicate('principal_id=? AND active=1',[ctx.principal.id]));if(staff.length!==1)throw new AdmissionError('validation','Choose the store for this repair photo');subject=repairRef('stores',str(staff[0]!,'store_id'));}const entity=subject.entityId===REPAIR_ENTITIES.stores?'stores':subject.entityId===REPAIR_ENTITIES.assets?'assets':null;if(subject.appId!==appId||!entity)throw new AdmissionError('forbidden','Repair capture must use an authorized store or asset');await repo.load(ctx,entity,subject.recordId);const fieldId=repairFieldId(entity,'repair_evidence'),scope=await repo.scope(ctx,entity);if(!scope.readableFieldIds.includes(fieldId)||!scope.writableFieldIds.includes(fieldId))throw new AdmissionError('forbidden','Repair evidence field is not writable');return {subject,fieldIds:[fieldId]};};}
