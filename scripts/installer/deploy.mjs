import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ownerWorkerName,ownerPlan} from '@runeditrun/rer/modules/deploy-kit/owner';
import {ownerArtifact} from '../deployment/owner-artifact.mjs';
import {deployOwner} from '../deployment/deploy.mjs';
import {adapter} from './local.mjs';

/** Validate and deploy the complete native artifact through Base's owner kit. */
export async function deploy({root,options,store,signal,operationToken}){
 await adapter.run(root,{},store,()=>{},signal,{verb:'build',operationToken});
 const environment=options.environment??'production';
 if(options.dryRun){
  const declaration=JSON.parse(await readFile(join(root,'deploy.json'),'utf8'));
  const worker=ownerWorkerName(declaration.project,environment);
  const artifact=await ownerArtifact(root);
  ownerPlan({project:declaration.project,environment,worker,origin:`https://${worker}.example.invalid`},declaration,artifact);
  store.report('deploy: dry run complete; no deployment occurred and no provider request was made.');
  return {dryRun:true,deployed:false,migrations:artifact.migrations.length};
 }
 const result=await deployOwner(['--environment',environment],process.env,{root});
 return {deployed:true,origin:result.origin,state:result.state,setupToken:result.setupToken};
}
