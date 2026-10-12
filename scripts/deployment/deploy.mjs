import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {cloudflare} from '../../vendor/base/modules/deploy-kit/provider.mjs';
import {ownerTarget,ownerPlan,ownerDeploy} from '../../vendor/base/modules/deploy-kit/owner.mjs';
import {report} from '../../vendor/base/modules/deploy-kit/owner-cli.mjs';
import {ownerArtifact} from './owner-artifact.mjs';
import {ownerDeclaration} from './declaration.mjs';

/** Own-account deployment; the maintained Base kit owns resource custody and health. */
export async function deployOwner(args=process.argv.slice(2),env=process.env,{root=process.cwd(),fetch=globalThis.fetch}={}){
 const {values}=parseArgs({args,strict:true,options:{environment:{type:'string',default:'production'}}});
 const declaration=await ownerDeclaration(root,env);
 const inputs=['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN',...declaration.secrets.map(input=>input.environment)];
 const missing=inputs.filter(key=>!env[key]?.trim());
 if(missing.length){const error=new Error('missing-input');error.inputs=missing;throw error;}
 if(!['sendgrid','resend'].includes(env.MAIL_PROVIDER))throw new Error('invalid-mail-provider');
 const artifact=await ownerArtifact(root);
 const api=cloudflare({accountId:env.CLOUDFLARE_ACCOUNT_ID,token:env.CLOUDFLARE_API_TOKEN,fetch});
 const target=await ownerTarget(api,{project:declaration.project,environment:values.environment});
 const plan=ownerPlan(target,declaration,artifact);
 const statePath=resolve(root,'.rer/deploy',`${target.environment}.json`);
 const {receipt,created}=await ownerDeploy({api,target,plan,artifact,statePath,env,fetch});
 return {ok:true,origin:receipt.origin,versionId:receipt.provider.versionId,created,state:statePath};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await deployOwner()));}
 catch(error){console.error(JSON.stringify(report(error)));process.exitCode=1;}
}
