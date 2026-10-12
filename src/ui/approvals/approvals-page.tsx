import type { Page } from '../../contracts/primitives'
import type { Decision } from '../../domains/decisions/contracts'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { useResource } from '../shared/api'
import { Empty, ResourceState, Timestamp } from '../shared/presentation'
import { DecisionReview } from './decision-review'
export function ApprovalsPage({ decisionId }: { decisionId?: string }) {
  return <OperatorFeaturePage currentPath="/app" title=""><div className="cr-page">{decisionId ? <DecisionReview key={decisionId} id={decisionId} /> : <DecisionList />}</div></OperatorFeaturePage>
}
function DecisionList() {
  const decisions = useResource<Page<Decision>>('/api/v1/decisions?state=awaiting')
  return <><header className="cr-page-header"><h1>Decisions</h1></header><ResourceState resource={decisions.resource} operation="required decisions" retry={decisions.refresh}>{page => page.items.length ? <div className="cr-stack">{page.items.map(decision => <article className="cr-card" key={decision.id}><p className="cr-eyebrow">{decision.kind} · {decision.state}</p><h2>{decision.recommendation}</h2><p>{decision.impact.summary}</p><p>Due <Timestamp value={decision.dueAt} /></p><a className="cr-button" href={`/app/approvals/${decision.id}`}>Review decision</a></article>)}</div> : <Empty title="No decisions waiting">Prepared decisions will appear here when your authority is required.</Empty>}</ResourceState></>
}
