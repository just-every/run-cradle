import type {RepairDependencies} from '../../apps/repairs/ports';
import {createRepairRepository} from '../../apps/repairs/repository.server';
import {createRepairReads} from '../../apps/repairs/reads.server';
import {repairRef} from '../../apps/repairs/model';
import type {IntelligenceRepository} from './repository.server';
import type {Strategy,PortfolioProblem,StoredSnapshot} from './service-contracts';
import type {PortfolioDecisionCatalogue} from './catalogue.server';
import {canonical} from './exact';
import {hiddenArtifact} from './visibility';
/** Uses P's row/field policy and E's current source projection; never derives approval from source prose. */
export function createPortfolioDecisionCatalogue(repository:IntelligenceRepository,deps:RepairDependencies):PortfolioDecisionCatalogue{
 const repairs=createRepairRepository(deps),reads=createRepairReads(deps);
 return{async list(ctx,strategyId){const strategy=await repository.read<Strategy>(ctx,'strategies',strategyId),problem=await repository.read<PortfolioProblem>(ctx,'problems',strategy.problemId),row=await repository.read<StoredSnapshot>(ctx,'snapshots',problem.snapshotId);
 const choices=row.snapshot.choices.filter(choice=>strategy.candidate.selectedIds.includes(choice.id));const ids=await deps.db.prepare("SELECT id FROM business_decisions WHERE lifecycle='approved' AND (expires_at IS NULL OR expires_at>?) ORDER BY id").bind(ctx.now).all<{id:string}>();const visible=[];
 for(const {id}of ids.results){try{const decision=await reads.decision(ctx,id);if(!choices.some(choice=>choice.actionInputHash===decision.exactInputHash&&canonical(choice.subject)===canonical(decision.subject)))continue;for(const link of decision.evidence){const source=await deps.evidence.source(ctx,link.sourceId);if(source.ref.version!==link.sourceVersion)throw Object.assign(new Error('Decision source changed'),{code:'not_found'});}await repairs.load(ctx,'decisions',id);visible.push({...decision,label:decision.recommendation,expected:[{ref:repairRef('decisions',id),version:decision.version}]});}catch(error){if(!hiddenArtifact(error))throw error;}}
 return visible;
 }};
}
