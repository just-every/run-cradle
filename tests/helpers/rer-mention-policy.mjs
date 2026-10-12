import assert from 'node:assert/strict'
import {bindings} from './rer-data-fixture.mjs'
const appId='00000000000000000000000700',campaign='00000000000000000000000701'
export async function mentionAuthorityControls(copy,prior,mention){
 const stored=await bindings(copy.source,async({DB})=>DB.prepare("SELECT p.id,p.rules_json,m.principal_id FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id JOIN authority_principals a ON a.id=m.principal_id WHERE m.app_id=? AND a.initial_owner=1").bind(appId).first())
 const rules=JSON.parse(stored.rules_json),rule=rules.find(rule=>rule.entityId===campaign),before=await bindings(copy.source,async({DB})=>(await DB.prepare('SELECT count(*) n FROM comments').first()).n)
 const save=async rules=>bindings(copy.source,async({DB})=>{await DB.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),stored.id).run()})
 try{
  await save(rules.map(rule=>({...rule,actions:rule.actions.filter(action=>action!=='launch.comment.create')})));await mention(403)
  await save([...rules,{...rule,id:'00000000000000000000009998',effect:'deny',actions:['launch.comment.create']}]);await mention(403)
  await save(rules.map(value=>value===rule?{...value,rows:{kind:'condition',fieldId:rule.readableFields[0],op:'eq',value:'No matching campaign'}}:value));await mention(403)
  await save(rules);await bindings(copy.source,async({DB})=>{await DB.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=? AND app_id=?").bind(stored.principal_id,appId).run()});await mention(403)
 }finally{await save(rules);await bindings(copy.source,async({DB})=>{await DB.prepare("UPDATE authority_memberships SET state='active',version=version+1 WHERE principal_id=? AND app_id=?").bind(stored.principal_id,appId).run()})}
 await bindings(copy.source,async({DB})=>assert.equal((await DB.prepare('SELECT count(*) n FROM comments').first()).n,before,'Refused comment controls create no comment'))
 console.log('COMMENT_POLICY: absent action403; explicit deny403; hidden row403; revoked membership403; zero mutations')
}
