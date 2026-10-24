import type {EntitySchema} from '../../domains/records/contracts'
import type {RecordAutomationAction} from '../../domains/automations/contracts'
export type VisibleTestStep={position:number;kind:string;state:string;input:unknown;output:unknown}
const value=(input:unknown):string=>input===undefined?'Unavailable':input===null?'Empty':typeof input==='string'?input:typeof input==='boolean'?input?'Yes':'No':JSON.stringify(input)
export function AutomationTestStep({step,entity}:{step:VisibleTestStep;entity:EntitySchema}){
 const input=step.input as {action:RecordAutomationAction;values:Record<string,unknown>},raw=step.output as Record<string,unknown>|null,output=(raw?.preview??raw) as Record<string,unknown>|null
 const action=input.action,field=action.kind==='update'?entity.fields.find(field=>field.id===action.fieldId):undefined
 return <li className="cr-stack"><strong>Action {step.position+1} · {step.kind} · {step.state}</strong><details><summary>Input and output</summary><div className="cr-stack">
  <h4>Record input</h4><dl className="cr-stack">{entity.fields.filter(field=>Object.hasOwn(input.values,field.id)).map(field=><div key={field.id}><dt className="cr-muted">{field.label}</dt><dd style={{marginInlineStart:0,overflowWrap:'anywhere'}}>{value(input.values[field.id])}</dd></div>)}</dl>
  {action.kind==='update'&&<><h4>Proposed update</h4>{field?<dl className="cr-stack"><div><dt>{field.label} before</dt><dd>{value(output?.before)}</dd></div><div><dt>{field.label} after</dt><dd>{value(output?.after)}</dd></div></dl>:<p role="alert">Refresh the schema to view this field.</p>}</>}
  {action.kind==='notify'&&<><h4>Notification</h4><p>{action.title}</p><p>Recipient: {value(output?.wouldNotify)}</p><p>{raw?.result?step.state==='Complete'?'The live notification was created.':step.state==='Unknown'?'Live notification outcome is uncertain. Check its receipt.':'The live notification failed.':'Preview only. No notification was created.'}</p></>}
  {action.kind==='slack-app'&&<><h4>Slack app approval</h4><p>{action.text}</p><p>{raw?.result?'Live delivery was attempted.':'Preview only. No Slack message was sent.'}</p></>}
  {action.kind==='sms'&&<><h4>SMS</h4><p>To: {value(output?.to)}</p><p>{value(output?.text)}</p><p>{raw?.result?'Live delivery was attempted.':'Preview only. No SMS was sent.'}</p></>}
  {action.kind==='email'&&<><h4>Email</h4><p>Subject: {action.subject}</p><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{action.text}</p><p>Would have used: {(output?.wouldHaveUsed as string[]|undefined)?.join(', ')}</p><p>{raw?.result?'Live delivery':output?.sent?'Test delivered to you':'Test delivery'}: {((output?.to??output?.wouldHaveUsed) as string[]|undefined)?.join(', ')}</p></>}
  {(action.kind==='webhook'||action.kind==='slack')&&<><h4>{action.kind==='webhook'?'Signed webhook request':'Slack request'}</h4><p>{raw?.result?'Live delivery was attempted.':'Held. No request was sent.'}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxWidth:'100%'}}>{JSON.stringify(output?.wire,null,2)}</pre></>}
  {raw?.error!==undefined&&<p className="cr-error">{String(raw.error)}</p>}
 </div></details></li>
}
