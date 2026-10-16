import type {RepairExecutionPort} from './ports';

/** A refused attempt can still belong to a run waiting to retry the same effect. */
export function terminalRefusal(observed:Awaited<ReturnType<RepairExecutionPort['read']>>){
 return observed.attempt.state==='refused'&&['failed','cancelled'].includes(observed.runState);
}
