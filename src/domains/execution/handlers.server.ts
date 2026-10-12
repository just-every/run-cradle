import { createUlid } from '../../core/shared/ids';
import type { ExecutionDependencies } from './ports';
import { createExecutionService } from './service.server';
import { createOutboxReader } from '../admission/outbox.server';
import { attemptsTable } from './tables.server';
import { and, eq } from '../admission/sql.server';
import { canonical, sha256 } from '../../adapters/crypto.server';
import type { AttemptRow } from './repository.server';
import type { EffectRequest } from './contracts';
export function createExecutionHandlers(deps:ExecutionDependencies){const service=createExecutionService(deps),outbox=createOutboxReader(deps.db);return {
 async queue(batch:MessageBatch<{outboxId:string}>){for(const message of batch.messages){try{if(typeof message.body?.outboxId!=='string')throw new Error('Invalid execution queue envelope');const entry=await outbox.get(message.body.outboxId);const input=entry?.input;if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.runId!=='string')throw new Error('Execution outbox identity missing');const ctx=await deps.backgroundContext(input.runId,'queue');await service.dispatch(ctx,message.body.outboxId);message.ack();}catch{message.retry({delaySeconds:60});}}},
 async scheduled(){const now=new Date().toISOString();const results:{runId:string;state:'processed'|'blocked'}[]=[];
  for(const pending of await outbox.due(now)){if(!['execution.dispatch','execution.reconcile','execution.recover'].includes(pending.action))continue;const input=pending.input;if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.runId!=='string')throw new Error('Invalid durable execution outbox');try{await service.dispatch(await deps.backgroundContext(input.runId,'schedule'),pending.id);}catch{results.push({runId:input.runId,state:'blocked'});}}
  for(const entry of await service.repository.due(now)){try{await service.run(await deps.backgroundContext(entry.id,'schedule'),entry.id);results.push({runId:entry.id,state:'processed'});}catch{results.push({runId:entry.id,state:'blocked'});}}
  const unknowns=(await deps.db.prepare("SELECT * FROM execution_attempts WHERE state IN ('unknown','dispatching') AND unknown_deadline<=? AND escalated_at IS NULL ORDER BY unknown_deadline,id LIMIT 100").bind(now).all<AttemptRow>()).results;
  for(const a of unknowns){const run=await service.repository.run(a.run_id);if(!run)throw new Error('Unknown attempt lost run');const r=JSON.parse(run.request_json) as EffectRequest,ctx=await deps.backgroundContext(run.id,'schedule'),hash=await sha256(canonical({attemptId:a.id,unknownDeadline:a.unknown_deadline}));const permit=await service.reconciliationPermit(ctx,run.id);await deps.admission.commit(ctx,{commandId:createUlid(),action:permit.action,appId:r.appId,canonicalInputHash:hash,permit,guards:[],mutations:[{kind:'update',table:attemptsTable,set:{escalated_at:now,version:a.version+1,updated_at:now},where:and(eq(attemptsTable,'id',a.id),eq(attemptsTable,'version',a.version),eq(attemptsTable,'escalated_at',null)),expectedRows:1}],audit:[{action:'execution.unknown-escalated',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[{name:'execution.unknown-overdue',version:1,subject:null,payload:{attemptId:a.id,runId:run.id,custodianId:a.custodian_id,firstPossibleEffectAt:a.first_possible_effect_at,deadline:a.unknown_deadline},causeRunIds:r.causeRunIds}],outbox:[],committedResult:{attemptId:a.id,escalatedAt:now}});}
  return results;
 }
};}

