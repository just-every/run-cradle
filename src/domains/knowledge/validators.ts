import {z} from 'zod';
const id=z.string().min(1).max(200),instant=z.string().datetime({offset:true});
const ref=z.object({appId:id,entityId:id,recordId:id}).strict();
const money=z.object({minor:z.string().regex(/^\d+$/),currency:z.string().regex(/^[A-Z]{3}$/),scale:z.number().int().min(0).max(6)}).strict();
const value=z.union([z.null(),z.string(),z.boolean(),money,ref,z.array(ref),z.array(z.string()),z.array(z.object({fileId:id}).strict())]);
export const sourceVersions=z.array(z.object({id,version:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1);
export const temporalFactSchema=z.object({id,version:z.number().int().positive(),ownerId:id,appId:id,kind:z.enum(['observation','source_assertion','preference','assumption','forecast']),subject:ref,predicate:z.string().min(1).max(500),value,effectiveAt:instant,knownAt:instant,sourceVersions,supersedesVersion:z.number().int().positive().nullable(),state:z.enum(['valid','disputed','superseded','stale']),dependencies:z.array(id)}).strict();
export const correctionSchema=z.object({factId:id,expectedVersion:z.number().int().positive(),value,effectiveAt:instant,reason:z.string().min(1),sourceVersions}).strict();
