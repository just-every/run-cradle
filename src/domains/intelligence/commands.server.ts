import type {RequestContext} from '../authority/ports';
import type {CommandResult} from '../../contracts/primitives';
import {ApiError} from '../../core/registry/errors';
import {digest} from './exact';
import type {IntelligenceRepository,Collection} from './repository.server';
export type CommandScope={appId:string}|{collection:Collection;id:string}|{factId:string};
export type ReplayIdentity={commandId:string;action:string;appId:string;canonicalInputHash:string};
const envelopes=new WeakMap<RequestContext,unknown>();
export function bindCommandEnvelope<T>(ctx:RequestContext,envelope:T):T{envelopes.set(ctx,envelope);return envelope;}
const identities=new WeakMap<RequestContext,ReplayIdentity>();
export const boundIdentity=(ctx:RequestContext,commandId:string)=>{const identity=identities.get(ctx);return identity?.commandId===commandId?identity:null;};
export async function replayIdentity(repo:IntelligenceRepository,ctx:RequestContext,commandId:string,action:string,input:unknown,scope:CommandScope):Promise<ReplayIdentity>{
 const canonicalInputHash=await digest({action,input:envelopes.get(ctx)??input});
 // A previous command determines its own application; changed target IDs still conflict even if now absent.
 const prior=await repo.db.prepare('SELECT app_id FROM command_admissions WHERE command_id=?').bind(commandId).first<{app_id:string}>();
 const appId=prior?.app_id??await repo.scopeApp(scope);
 return{commandId,action,appId,canonicalInputHash};
}
export async function runCommand<T>(repo:IntelligenceRepository,ctx:RequestContext,commandId:string,action:string,input:unknown,scope:CommandScope,work:(ctx:RequestContext)=>Promise<T>):Promise<T>{
 const nested=boundIdentity(ctx,commandId);if(nested)return work(ctx);
 const identity=await replayIdentity(repo,ctx,commandId,action,input,scope);
 const prior=await repo.admission.replay<T>(ctx,commandId,action,identity.appId,identity.canonicalInputHash);
 if(prior){await repo.readableResult(ctx,action,identity.appId,prior.result);if(prior.result.state!=='committed')throw new ApiError('invalid_transition','This command is still being processed.');return prior.result.value;}
 const scoped={...ctx};identities.set(scoped,identity);
 try{return await work(scoped);}finally{identities.delete(scoped);}
}
export function resultValue(result:CommandResult<unknown>):unknown{return result.state==='committed'?result.value:null;}
