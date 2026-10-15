import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'

/** Both delivery paths use the source producer's declared application inputs. */
export async function ownerDeclaration(root,env){
 const declaration=JSON.parse(await readFile(resolve(root,'deploy.json'),'utf8'))
 // Bind only the credentials for the provider selected for this installation.
 const mailBindings=new Set(['MAIL_PROVIDER_API_KEY','MAIL_API_KEY','MAIL_RELAY_URL'])
 declaration.secrets=declaration.secrets.filter(input=>!mailBindings.has(input.binding))
 const {specInputs}=JSON.parse(await readFile(resolve(root,'packaging.json'),'utf8')).artifact
 const bound=new Set(declaration.secrets.map(input=>input.binding))
 const optional=[...specInputs.optionalSecretNames,...specInputs.publicVariableNames]
 for(const name of optional){
  // The owner kit assigns the hosted origin; local auth origins are not hosted inputs.
  if(bound.has(name)||mailBindings.has(name)||name===declaration.originVar||name==='AUTH_ORIGIN')continue
  if(!env[name]&&!(name==='EGRESS_RELAY_SECRET'&&env.EGRESS_RELAY_URL))continue
  declaration.secrets.push({binding:name,environment:name});bound.add(name)
 }
 const mailNames=env.MAIL_PROVIDER==='rer'?['MAIL_API_KEY','MAIL_RELAY_URL']:['MAIL_PROVIDER_API_KEY']
 for(const name of mailNames)if(!bound.has(name))declaration.secrets.push({binding:name,environment:name})
 return declaration
}

/** The CLI reads this before building; the demo keeps its own base declaration. */
export async function managedOwnerDeclaration(root){
 const declaration=await ownerDeclaration(root,{MAIL_PROVIDER:'rer',MAIL_FROM:'noreply@example.test'})
 const standIns={MAIL_PROVIDER:'rer',MAIL_FROM:'noreply@example.test',MAIL_RELAY_URL:'https://mail.example.test/api/managed-mail/send'}
 for(const input of declaration.secrets)if(standIns[input.binding])input.verifyStandIn=standIns[input.binding]
 return declaration
}
