import type {RequestContext} from '../authority/ports';
import type {OperationsService} from './service.server';
import {createOperationWorker} from './worker.server';
import {createUlid} from '../../core/shared/ids';
/** Called only by the real schedule/queue consumer. Selection never causes model work in a read route. */
export function createOperationScheduler(service:OperationsService,backgroundContext:(caseId:string)=>Promise<RequestContext>){
 const worker=createOperationWorker(service.repo);
 return{async tick(now:string,maximum=20){if(!Number.isInteger(maximum)||maximum<1||maximum>100)throw new Error('Bounded operation scheduler limit required');const db=service.repo.d.db;
 const due=await db.prepare("SELECT c.id FROM operation_cases c JOIN operation_mandates m ON m.id=c.mandate_id WHERE c.state IN ('active','waiting','blocked') AND json_extract(m.data_json,'$.state')='active' AND json_extract(c.data_json,'$.nextWakeAt')<=? ORDER BY json_extract(c.data_json,'$.nextWakeAt'),c.id LIMIT ?").bind(now,maximum).all<{id:string}>();
 const results=[];for(const row of due.results){try{const ctx=await backgroundContext(row.id),c=await service.repo.getCase(ctx,row.id);const existing=await db.prepare("SELECT id FROM operation_wakes WHERE case_id=? AND epoch=? AND (state='queued' OR (state='leased' AND lease_until<=?)) ORDER BY id LIMIT 1").bind(c.id,c.controlEpoch,now).first<{id:string}>();let wakeId=existing?.id;if(!wakeId){const accepted=await service.wake(ctx,{commandId:createUlid(),expected:[],controlEpoch:c.controlEpoch,input:{caseId:c.id,reason:'Scheduled evidence and objective check'}});if(accepted.result.state!=='committed')throw new Error('Wake admission was not committed');wakeId=accepted.result.value.id;}const result=await worker.run(ctx,wakeId,createUlid());results.push({caseId:c.id,state:result.case.state});}catch(error){results.push({caseId:row.id,state:'failed',reason:error instanceof Error?error.message:'Operation wake failed'});}}
 return results;}
 };
}
