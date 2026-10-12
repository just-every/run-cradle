import type { RequestContext } from '../authority/ports';
import type { ModelPort, ModelContextArtifact, ModelTask } from '../execution/model-ports';
import type { Money } from '../../contracts/primitives';
import type { ConstructionModelPort, AuthorizedMaterials } from './ports';
import type { AppSource, SourceSnapshot } from './contracts';
import { canonical,digest } from './source';
export class ConstructionModel implements ConstructionModelPort {
 constructor(readonly db:D1Database,readonly model:ModelPort,readonly context:(ctx:RequestContext,materials:AuthorizedMaterials)=>Promise<ModelContextArtifact>,readonly options:{profileId:string;maximumCost:Money;deadlineSeconds:number}){}
 async generate(ctx:RequestContext,input:{appId:string;instruction:string;materials:AuthorizedMaterials;current:SourceSnapshot|null;baseline:SourceSnapshot|null;proposed:SourceSnapshot|null;contract:string},validate:(value:unknown)=>AppSource){
  const context=await this.context(ctx,input.materials);
  if(context.id!==input.materials.artifactId||context.sha256!==input.materials.sha256||context.purpose!==input.materials.contextPurpose)throw new Error('construction_context_mismatch');
  const proposed={requestId:ctx.requestId,purpose:context.purpose,profileId:this.options.profileId,context,input:{appId:input.appId,instruction:input.instruction,current:input.current,baseline:input.baseline,proposed:input.proposed,contract:input.contract},outputSchemaId:'cradle.application-source',outputSchemaVersion:1,maximumCost:this.options.maximumCost,deadline:new Date(new Date(ctx.now).getTime()+this.options.deadlineSeconds*1000).toISOString()};
  const inputHash=await digest(canonical({appId:input.appId,instruction:input.instruction,current:input.current,baseline:input.baseline,proposed:input.proposed,contract:input.contract,sourceVersions:input.materials.sourceVersions,profileId:this.options.profileId,maximumCost:this.options.maximumCost}));
  await this.db.prepare('INSERT INTO construction_model_tasks(request_id,principal_id,input_hash,task_json,created_at) VALUES(?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING').bind(ctx.requestId,ctx.principal.id,inputHash,canonical(proposed),ctx.now).run();
  const saved=await this.db.prepare('SELECT principal_id,input_hash,task_json FROM construction_model_tasks WHERE request_id=?').bind(ctx.requestId).first<{principal_id:string;input_hash:string;task_json:string}>();
  if(!saved||saved.principal_id!==ctx.principal.id||saved.input_hash!==inputHash)throw new Error('construction_model_request_conflict');
  const result=await this.model.generate(ctx,JSON.parse(saved.task_json) as ModelTask<typeof proposed.input>,validate);
  return{value:result.value,modelCallId:result.call.id,producerId:result.call.model};
 }
}
