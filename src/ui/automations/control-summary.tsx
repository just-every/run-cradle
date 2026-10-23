import type {RecordAutomationDefinition} from '../../domains/automations/contracts'
export function AutomationControlSummary({definition,onClose}:{definition:RecordAutomationDefinition;onClose:()=>void}){
 return <section className="cr-card cr-stack" aria-label="Saved control steps"><h3>Saved control steps</h3><p>These saved steps are read-only here. Disable the automation to stop future runs.</p><ol className="cr-stack">
  {definition.actions.map((action,index)=><li key={index}>{action.kind}{action.when?' when its condition matches':''}</li>)}
  {(definition.steps??[]).map((step,index)=><li key={index}>{step.kind==='action'?step.action.kind:step.kind==='condition'?`When conditions match: ${step.actions.map(action=>action.kind).join(', ')}`:step.kind==='repeat'?`For each matching record: ${step.actions.map(action=>action.kind).join(', ')}`:<><p>First matching branch</p><ol>{step.paths.map((path,index)=><li key={index}>Path {index+1}: {path.actions.map(action=>action.kind).join(', ')}</li>)}</ol>{step.otherwise&&<p>Otherwise: {step.otherwise.map(action=>action.kind).join(', ')}</p>}</>}</li>)}
 </ol><button type="button" className="cr-button cr-button--quiet" onClick={onClose}>Close saved steps</button></section>
}
