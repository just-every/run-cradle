import {join} from 'node:path'
import {readSettings} from '@runeditrun/rer/adapter-settings'
import {privateDirectory,writePrivateFile} from '@runeditrun/rer/private-files'

/** The one manifest names runtime bindings. Local development opens through the checkout key. */
export async function prepareHostingMail(context){
 const names=['MAIL_PROVIDER','MAIL_FROM','MAIL_PROVIDER_API_KEY','MAIL_RELAY_URL','MAIL_API_KEY']
 await privateDirectory(context.root,['data'])
 const saved=await readSettings(context.root,{file:'data/hosting-mail.json',format:'json'})
 const hosted=context.input.MAIL_PROVIDER&&context.input.MAIL_PROVIDER!=='development'
 const entered=hosted?Object.fromEntries(names.filter(name=>typeof context.input[name]==='string'&&context.input[name])
  .map(name=>[name,context.input[name]])):{}
 context.hostedMail={...saved.values,...entered}
 context.store.addSecrets([context.hostedMail.MAIL_PROVIDER_API_KEY,context.hostedMail.MAIL_API_KEY].filter(Boolean))
 if(Object.keys(entered).length){
  await writePrivateFile(join(context.root,'data/hosting-mail.json'),JSON.stringify(context.hostedMail)+'\n')
 }
 // The installer starts a local app even when its final phase hosts it. Preserve
 // entered hosting answers separately; that app uses the explicit local development configuration.
 context.input={...context.input,MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test'}
 delete context.input.MAIL_PROVIDER_API_KEY
 delete context.input.MAIL_API_KEY
 delete context.input.MAIL_RELAY_URL
}
