import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {cloudflare} from '@runeditrun/rer/modules/deploy-kit/provider';
import {ownerTarget,ownerPlan,ownerDeploy,settleOwnerState} from '@runeditrun/rer/modules/deploy-kit/owner';
import {report} from '@runeditrun/rer/modules/deploy-kit/owner-cli';
import {ownerArtifact} from './owner-artifact.mjs';
import {ownerDeclaration} from './declaration.mjs';

/** Own-account deployment; the maintained Base kit owns resource custody and health. */
export async function deployOwner(args=process.argv.slice(2),env=process.env,{root=process.cwd(),fetch=globalThis.fetch}={}){
 const {values}=parseArgs({args,strict:true,options:{environment:{type:'string',default:'production'}}});
 const declaration=await ownerDeclaration(root,env);
 const inputs=['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN',...declaration.secrets.filter(input=>input.binding!=='SETUP_TOKEN').map(input=>input.environment)];
 const missing=inputs.filter(key=>!env[key]?.trim());
 if(missing.length){const error=new Error('missing-input');error.inputs=missing;throw error;}
 if(!['sendgrid','resend'].includes(env.MAIL_PROVIDER))throw new Error('invalid-mail-provider');
 const artifact=await ownerArtifact(root);
 const api=cloudflare({accountId:env.CLOUDFLARE_ACCOUNT_ID,token:env.CLOUDFLARE_API_TOKEN,fetch});
 const target=await ownerTarget(api,{project:declaration.project,environment:values.environment});
 const statePath=resolve(root,'.rer/deploy',`${target.environment}.json`);
 const state=await settleOwnerState({api,target,statePath});
 const current={...declaration,secrets:declaration.secrets.filter(input=>!state.retiredSecrets?.includes(input.binding))};
 const plan=ownerPlan(target,current,artifact);
 const {receipt,created,sentSecrets}=await ownerDeploy({api,target,plan,artifact,statePath,env,fetch,declaredSecrets:ownerPlan(target,declaration,artifact).secrets});
 return {ok:true,origin:receipt.origin,versionId:receipt.provider.versionId,created,state:statePath,
  ...(sentSecrets.includes('SETUP_TOKEN')?{setupToken:env.SETUP_TOKEN}:{})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const {setupToken,...result}=await deployOwner();console.log(JSON.stringify(result));}
 catch(error){console.error(JSON.stringify(report(error)));process.exitCode=1;}
}
