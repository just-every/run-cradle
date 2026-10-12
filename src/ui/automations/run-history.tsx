import { useResource } from '../shared/api'
import { ResourceState,Empty,Timestamp } from '../shared/presentation'
type Run={id:string;state:string;definitionVersion:number;recordId:string;queuedAt:string;errorCode:string|null;
 actions:{position:number;state:string;error_code:string|null}[]}
export function AutomationRunHistory({id}:{id:string}) {
 const runs=useResource<{runs:Run[]}>(`/api/user-automations/${encodeURIComponent(id)}/runs`)
 return <section className="cr-stack"><div className="cr-toolbar"><h3>Run history</h3><button className="cr-button cr-button--quiet" onClick={runs.refresh}>Refresh runs</button></div>
  <ResourceState resource={runs.resource} operation="automation runs" retry={runs.refresh}>{data=>data.runs.length?
   <div className="cr-stack">{data.runs.map(run=><article key={run.id} className="cr-card"><p><strong>{run.state}</strong> · definition {run.definitionVersion} · <Timestamp value={run.queuedAt}/></p>
    <p className="cr-muted">Record {run.recordId}</p>{run.errorCode&&<p className="cr-error">{run.errorCode}</p>}
    <ol>{run.actions.map(action=><li key={action.position}>Action {action.position+1}: {action.state}{action.error_code&&` (${action.error_code})`}</li>)}</ol>
    {run.state==='Unknown'&&<p>The receiver may have accepted this effect. Check its receipt before taking further action.</p>}
   </article>)}</div>:<Empty title="No runs yet">New matching record changes create runs after the definition is enabled.</Empty>}</ResourceState>
 </section>
}
