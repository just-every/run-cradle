import assert from 'node:assert/strict'
import {recordCalendarProvider} from './record-calendar-provider.mjs'
import {warehouseNetworkEdge} from './warehouse-network-edge.mjs'
import {launchAuthorityRuntime,createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'
import {recordAction,recordInput} from './record-comment-command.mjs'

/** Each independently scheduled walkthrough owns an emitted Worker and provider
 * edges; its runtime never borrows another group's fixtures or delivery history. */
export async function launchWalkthroughRuntime(){
let notificationMailStatus=202
const setNotificationMailStatus=status=>{notificationMailStatus=status}
const outageProvider=recordCalendarProvider()
const progressProvider=await warehouseNetworkEdge()
let h
try{h=await launchAuthorityRuntime({GOOGLE_CLIENT_ID:'synthetic-cradle-client',GOOGLE_CLIENT_SECRET:'synthetic-cradle-secret',...progressProvider.bindings,CONNECTION_ENCRYPTION_KEY_VERSION:'v1'}, {providerFetch:request=>request.url==='https://relay.egress.example.com/v1/deliver'?progressProvider.outbound(request):outageProvider.fetch(request),installedLaunchDefinitions:true,installationOwner:true,mailResponse:message=>message.subject==='You were mentioned in a comment'&&notificationMailStatus!==202?new Response(null,{status:notificationMailStatus}):undefined})}catch(error){await progressProvider.close();throw error}
h.notificationOutageProvider=outageProvider
h.notificationProgressProvider=progressProvider
const command=async(action,input,expected=[])=>{
 const response=await h.request(h.ownerSession,`/api/v1/commands/${recordAction(action)}`,{method:'POST',body:JSON.stringify({commandId:createUlid(),input:recordInput(action,input,expected),expected})})
 assert.equal(response.status,200,await response.clone().text());return (await response.json())
}
 try{
 const criticalAutomation=await h.db.prepare("SELECT id,version FROM automations WHERE shipped_key='critical-risk'").first()
 await command('automation.disable',{id:criticalAutomation.id},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.automation,recordId:criticalAutomation.id},version:criticalAutomation.version}])
 assert.equal((await h.db.prepare('SELECT enabled FROM automations WHERE id=?').bind(criticalAutomation.id).first()).enabled,0,'Manual escalation walkthrough disables only the shipped critical-risk automation through its command')
 await h.db.prepare('UPDATE operators SET name=? WHERE id=?').bind('Mira Example',h.owner).run()
 await h.db.batch([h.db.prepare('UPDATE workspace_settings SET timezone=?').bind('Australia/Brisbane'),h.db.prepare('UPDATE workspace SET timezone=?').bind('Australia/Brisbane')])
 const workspaceName=(await h.db.prepare('SELECT name FROM workspace WHERE id=?').bind('workspace').first()).name
  return {h,command,workspaceName,setNotificationMailStatus,close:async()=>{try{await h.close()}finally{await progressProvider.close()}}}
 }catch(error){try{await h.close()}finally{await progressProvider.close()}throw error}
}
