import type { PolicyEntity } from '../authority/scope.server';
import { MODEL_PROFILE_ENTITY_ID } from './profile-commands.server';
export { MODEL_PROFILE_ENTITY_ID };
export const CONNECTION_ENTITY_ID='01K00000000000000000000502';
export const RUN_ENTITY_ID='01K00000000000000000000503';
/** Payload and credential columns are deliberately not exposed as policy fields. */
export const executionPolicyEntities:readonly PolicyEntity[]=[
 {id:MODEL_PROFILE_ENTITY_ID,table:'execution_model_profiles',idColumn:'id',appColumn:'app_id',fields:[]},
 {id:CONNECTION_ENTITY_ID,table:'provider_connections',idColumn:'id',appColumn:'app_id',fields:[]},
 {id:RUN_ENTITY_ID,table:'execution_runs',idColumn:'id',appColumn:'app_id',fields:[]},
];
