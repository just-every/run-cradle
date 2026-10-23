import type { PolicyPort, RequestContext } from '../authority/ports';
import { AuthorityError } from '../authority/errors';
import { constructionNeedsText, type ConstructionNeed, type ConstructionReadiness } from './contracts';
import { digest } from './source';
/** Read afresh for the person asking. A composition supplies `model` only once it composes the construction model,
 * sources, builder and job handlers; until then every install reports it missing, and App studio says so instead of
 * offering a prepare that cannot run. */
export function constructionReadiness(d:{policy:PolicyPort;installationAppId:string;runner:boolean;model?:unknown}){
 return async(ctx:RequestContext):Promise<ConstructionReadiness>=>{
  const missing:ConstructionNeed[]=[];
  try{await d.policy.authorize(ctx,{appId:d.installationAppId,action:'application.prepare',expected:[],cost:[],inputHash:await digest(d.installationAppId)});}
  catch(error){if(!(error instanceof AuthorityError)||error.code!=='forbidden')throw error;missing.push('authority');}
  if(!d.model)missing.push('model');
  if(!d.runner)missing.push('runner');
  return{ready:!missing.length,missing};
 };
}
export const unreadyMessage=(readiness:ConstructionReadiness)=>`App studio needs ${constructionNeedsText(readiness.missing)} on this installation.`;
