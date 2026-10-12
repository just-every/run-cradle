import type {RequestContext,PolicyPort} from '../authority/ports';
import type {DescriptorRegistry} from '../records/descriptors.server';
import type {EvidencePort} from '../evidence/ports';
import type {Ref} from '../../contracts/primitives';
import type {Case} from './contracts';
import {and,eq,identifier} from '../admission/sql.server';
export function createCaseReferenceReader(d:{db:D1Database;policy:PolicyPort;descriptors:DescriptorRegistry;evidence:Pick<EvidencePort,'source'>}){
 return async(ctx:RequestContext,ref:Ref):Promise<string[]>=>{const scope=await d.policy.scope(ctx,{appId:ref.appId,entityId:ref.entityId,purpose:'read'}),descriptor=d.descriptors.get(ref.appId,ref.entityId),where=and(scope.rowPredicate,...scope.currentAuthorityGuards,eq(descriptor.table,descriptor.idColumn,ref.recordId));if(!await d.db.prepare(`SELECT 1 FROM ${identifier(descriptor.table.tableId)} WHERE ${where.sql}`).bind(...where.values).first())return[];const rows=await d.db.prepare("SELECT data_json FROM operation_cases WHERE app_id=? AND entity_id=? AND subject_id=? AND state NOT IN ('verified','failed','cancelled','abandoned') ORDER BY id").bind(ref.appId,ref.entityId,ref.recordId).all<{data_json:string}>();const ids=[];for(const row of rows.results){const c:Case=JSON.parse(row.data_json);try{for(const sourceId of c.sourceIds)await d.evidence.source(ctx,sourceId);ids.push(c.id);}catch(e){if(e instanceof Error&&'code'in e&&['not_found','forbidden'].includes(String(e.code)))continue;throw e;}}return ids;};
}
