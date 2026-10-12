import {bindings} from './rer-data-fixture.mjs'
/** Count-only evidence includes empty/unexercised stores; never emits stored contents. */
export async function retentionRows(root,stage){
 const counts=await bindings(root,async({DB})=>{
  const result=[]
  for(const {name}of(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND sql NOT LIKE 'CREATE VIRTUAL TABLE%' ORDER BY name").all()).results){
   const count=(await DB.prepare('SELECT count(*) n FROM "'+name.replaceAll('"','""')+'"').first()).n
   result.push({table:name,rows:count,coverage:count?'populated':'empty-unexercised',retentionStore:/(admission|command|audit|history|activity|comment|decision|execution|model_call|automation|notification|delivery|integration|knowledge|operation|claim|acceptance|handoff|import|ik_|source|release|erasure|lens|bulk|channel|connection|construction|runner|event|receipt|observation|proof|evaluation)/.test(name)})
  }
  return result
 })
 console.log('RETENTION_COUNTS '+JSON.stringify({stage,tables:counts}))
 return counts
}
