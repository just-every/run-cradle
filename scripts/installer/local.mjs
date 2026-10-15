import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {localInstaller} from '@runeditrun/rer/local-installer';
import {readSettings} from '@runeditrun/rer/adapter-settings';
import {features} from './ui/seed.mjs';
import {prepareHostingMail} from './hosting-mail.mjs';
import {claimOwner} from './owner.mjs';
import {commandAdapter as createCommandAdapter} from '@runeditrun/rer/adapter';
import {developmentTarget,previewTarget} from '@runeditrun/rer/operator-installer';
import {installOperator} from '@runeditrun/rer/operator-install';
import {selectLocalState} from '@runeditrun/rer/local/state';
import {operatorPrerequisites} from '@runeditrun/rer/operator-prerequisites';
import {deploy} from './deploy.mjs';
import {portability} from '../portability/local.mjs';

const lifecycle=localInstaller({
 features,node:'22.20.0',
 guard:async({root})=>{await selectLocalState(root);},
 async prepare(context){
  await selectLocalState(context.root);
  await prepareHostingMail(context);
  const saved=await readSettings(context.root,{file:'.dev.vars',format:'dotenv'});
  for(const key of ['OWNER_EMAIL','OWNER_NAME','WORKSPACE_NAME','WORKSPACE_TIMEZONE','WORKSPACE_CURRENCY']){
   const old=saved.values[key],next=context.input[key];
   if(old&&next&&old!==next)throw context.fail('setup');
  }
 },
 secrets:{keepExisting:true,originKey:'APP_ORIGIN',values:({origin})=>({AUTH_LOCAL:'true',AUTH_ORIGIN:origin,APP_ORIGIN:origin,MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test'})},
 build:['pnpm',['run','build:app']],
 migrate:({demo})=>['pnpm',['run','db:migrate:local',...(demo?['--persist-to',demo.state]:[])]],
 start:previewTarget,
 owner:claimOwner,signIn:{emailKey:'OWNER_EMAIL',returnTo:'/setup'},
 async hosting(context){
  if(context.input.target!=='remote')return;
  const {vars,input,store,hostedMail}=context;
  if(!hostedMail.MAIL_FROM||!['rer','sendgrid','resend'].includes(hostedMail.MAIL_PROVIDER)||(hostedMail.MAIL_PROVIDER==='rer'?(!hostedMail.MAIL_API_KEY||!hostedMail.MAIL_RELAY_URL):!hostedMail.MAIL_PROVIDER_API_KEY))throw context.fail('deploy');
  const policy=JSON.parse(await readFile(join(context.root,'packaging.json'),'utf8')).artifact.specInputs;
  const names=[...policy.secretNames,...policy.optionalSecretNames,...policy.publicVariableNames];
  const bindings=Object.fromEntries(names.filter(name=>typeof vars[name]==='string'&&vars[name]).map(name=>[name,vars[name]]));
  const env={...process.env,...bindings,...hostedMail,CLOUDFLARE_ACCOUNT_ID:input.accountId,CLOUDFLARE_API_TOKEN:input.apiToken};
  store.addSecrets([input.apiToken,hostedMail.MAIL_PROVIDER_API_KEY,hostedMail.MAIL_API_KEY]);
  await context.run('Deploying to your Cloudflare account',process.execPath,['scripts/deployment/deploy.mjs'],{step:'deploy',env});
  const {receipt}=JSON.parse(await readFile(join(context.root,'.rer/deploy/production.json'),'utf8'));
  if(new URL(receipt.origin).protocol!=='https:')throw context.fail('deploy');
  context.hostedUrl=receipt.origin;await store.step(`Deployed to ${receipt.origin}`);
 },
});
export const adapter={...lifecycle,
 localPrerequisites:async({root,vars,email,demo})=>vars.AUTH_LOCAL==='true'&&vars.MAIL_PROVIDER==='development'&&Boolean(vars.SESSION_SECRET)&&(demo||await operatorPrerequisites(root,email)),
 install:(root,input,store,onApp,signal)=>input.target==='remote'
  ? lifecycle.install(root,input,store,onApp,signal)
  : installOperator(root,input,store,onApp,signal,lifecycle.hooks),
};
export const {install}=adapter;
export const commandAdapter=createCommandAdapter(adapter,{
 dev:developmentTarget,preview:previewTarget,verify:['pnpm',['run','verify:app']],deploy,portability,
 deployDeclaration:'deploy-owner.json',
 settings:['.dev.vars','.dev.vars.previous','data/hosting-mail.json'],setup:{manifestFile:'rer-setup.json'},browserModule:'scripts/installer/ui/seed.mjs',product:'Cradle',
 // Local dev identity: the local-only Worker entry, the build output rer build scans
 // for the dev layer, and the one kept end-to-end email-link test.
 devIdentity:{entry:'src/server.dev.ts',output:['dist'],emailLinkTest:'tests/ui-local-signin.mjs'},
 localOnlyKeys:['RER_DEV_ORIGIN','RER_DEV_IDENTITY'],
 // The static run site at run-cradle.com: the approved homepage with Run Cradle, /run and the docs.
 site:{entry:'src/site/pages.tsx',output:'dist/site',declaration:'deploy-site.json',config:'vite.site.config.ts'},
 // The installed instance's hydrating public pages. The Lobby at / is plain server
 // HTML; the fresh hosted check has no first-run owner record for it to display.
 publicPages:['/docs','/docs/install','/signin'],
 input:{names:{email:'OWNER_EMAIL',name:'OWNER_NAME'},defaults:()=>({target:'local'})},
});
