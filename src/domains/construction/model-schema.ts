import type { ModelSchema } from '../execution/model-ports';
import type { Json } from '../../contracts/primitives';
import { validateAppSource } from './source';
import { sourceGenerationContract } from './ports';
const string={type:'string'},strings={type:'array',items:string};
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const ref=object({appId:string,entityId:string,recordId:string});
/** This schema transports ordinary files; it does not restrict application logic to a template vocabulary. */
export const applicationSourceModelSchema:ModelSchema={
 schema:object({files:{type:'array',minItems:1,maxItems:2000,items:object({path:string,content:string})},schemaRevision:string,policyVersion:{type:'integer',minimum:1},actionVersion:{type:'integer',minimum:1},sourcePolicy:object({grantsActive:{type:'boolean',const:false},contextExpanded:{type:'boolean',const:false}}),migrationPlanId:string,recoveryPlanId:string,diff:object(Object.fromEntries(['schema','source','permissions','egress','migrations','backfill','inFlight'].map(k=>[k,strings]))),impact:object({summary:string,spend:{type:'array',items:object({minor:{type:'string',pattern:'^[0-9]+$'},currency:string,scale:{type:'integer',minimum:0,maximum:9}})},commitments:strings,affected:{type:'array',items:ref},accessChanges:strings,egress:{type:'array',items:object({destination:string,fields:strings,purpose:string})},uncertainty:strings})}) as Record<string,Json>,
 instructions:sourceGenerationContract,
 validate(value){return validateAppSource(value) as unknown as Json;},
};
