import type { PolicyEntity } from '../authority/scope.server';
import { candidateEntityId,releaseEntityId,sourceEntityId,improvementEntityId } from './contracts';
export const constructionPolicyEntities:readonly PolicyEntity[]=[
 {id:candidateEntityId,table:'construction_candidates',idColumn:'id',appColumn:'app_id',fields:[]},
 {id:releaseEntityId,table:'app_releases',idColumn:'id',appColumn:'app_id',fields:[]},
 {id:sourceEntityId,table:'construction_source_snapshots',idColumn:'id',appColumn:'app_id',fields:[]},
 {id:improvementEntityId,table:'app_improvements',idColumn:'id',appColumn:'app_id',fields:[]},
];
