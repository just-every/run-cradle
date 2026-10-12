import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'

/** Both delivery paths use the source producer's declared application inputs. */
export async function ownerDeclaration(root,env){
 const declaration=JSON.parse(await readFile(resolve(root,'deploy.json'),'utf8'))
 const {specInputs}=JSON.parse(await readFile(resolve(root,'packaging.json'),'utf8')).artifact
 const bound=new Set(declaration.secrets.map(input=>input.binding))
 const optional=[...specInputs.optionalSecretNames,...specInputs.publicVariableNames]
 for(const name of optional){
  // The owner kit assigns the hosted origin; local auth origins are not hosted inputs.
  if(bound.has(name)||name===declaration.originVar||name==='AUTH_ORIGIN')continue
  if(!env[name]&&!(name==='EGRESS_RELAY_SECRET'&&env.EGRESS_RELAY_URL))continue
  declaration.secrets.push({binding:name,environment:name});bound.add(name)
 }
 return declaration
}
