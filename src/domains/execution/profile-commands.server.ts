import { z } from 'zod';
import type { CommandRegistry } from '../../core/registry/commands';
import { canonical,sha256 } from '../../adapters/crypto.server';
import { ApiError } from '../../core/registry/errors';
import { profileInput, type createModelProfiles } from './profiles.server';
export const MODEL_PROFILE_ENTITY_ID='01K00000000000000000000501';
const id=z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
export const modelConfigureInput=z.object({id:id.optional(),appId:id.optional(),profile:profileInput}).strict().superRefine((input,ctx)=>{if(!input.id&&!input.appId)ctx.addIssue({code:'custom',path:['appId'],message:'Creating a model profile requires its owning app.'});});
const envelope=z.object({commandId:id,expected:z.array(z.object({ref:z.object({appId:id,entityId:id,recordId:id}).strict(),version:z.number().int().positive()}).strict()),input:modelConfigureInput}).strict();
export function registerModelProfileCommands(registry:CommandRegistry,d:{db:D1Database;profiles:ReturnType<typeof createModelProfiles>}){
 registry.register({action:'model.configure',description:'Configure an app-owned model profile with independently verified readiness.',inputSchema:z.toJSONSchema(modelConfigureInput) as never,input:envelope,visible:async ctx=>ctx.principal.kind==='human',replayIdentity:async(_ctx,c)=>{const row=c.input.id?await d.db.prepare('SELECT app_id FROM execution_model_profiles WHERE id=?').bind(c.input.id).first<{app_id:string}>():null;const appId=row?.app_id??c.input.appId;if(!appId)throw new ApiError('validation','Model profile app is required.');if(row&&c.input.appId&&row.app_id!==c.input.appId)throw new ApiError('forbidden','Model profile belongs to another app.');const expected=c.expected.find(item=>item.ref.appId===appId&&item.ref.entityId===MODEL_PROFILE_ENTITY_ID&&item.ref.recordId===c.input.id);return {appId,canonicalInputHash:await sha256(canonical({input:c.input.profile,id:c.input.id??null,expectedVersion:expected?.version??null}))};},prepare:async(ctx,c)=>{
  let appId=c.input.appId,version:number|undefined;
  if(c.input.id){const old=await d.db.prepare('SELECT app_id,version FROM execution_model_profiles WHERE id=?').bind(c.input.id).first<{app_id:string;version:number}>();if(!old)throw new ApiError('not_found','Model profile not found.');if(appId&&appId!==old.app_id)throw new ApiError('forbidden','Model profile belongs to another app.');appId=old.app_id;const expected=c.expected.find(item=>item.ref.appId===appId&&item.ref.entityId===MODEL_PROFILE_ENTITY_ID&&item.ref.recordId===c.input.id);if(!expected||expected.version!==old.version)throw new ApiError('version_conflict','Supply the current model profile revision.');version=expected.version;}
  if(!appId)throw new ApiError('validation','Creating a model profile requires its owning app.');
  return d.profiles.prepare(ctx,c.commandId,appId,c.input.profile,c.input.id,version);
 }});
}
