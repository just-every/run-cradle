import {trustedPredicate} from '../../domains/admission/sql.server'
/** Manual continuation cannot stand in for reconciliation of a retained provider run. */
export function noRepairExecution(appId:string,caseId:string,workId:string){return trustedPredicate("NOT EXISTS(SELECT 1 FROM execution_runs WHERE app_id=? AND (json_extract(request_json,'$.caseId')=? OR json_extract(request_json,'$.businessBinding.subject.ref.recordId')=?))",[appId,caseId,workId])}
