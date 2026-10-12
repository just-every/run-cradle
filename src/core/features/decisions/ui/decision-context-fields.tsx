import type { Decision } from './decision-client'

type Context = Pick<Decision, 'escalationReason' | 'recommendation' | 'recommendationSource' | 'impact'>

export const DecisionContextFields = ({ decision }: { decision: Context }) => <dl className="mt-6 grid gap-5 border-y border-border py-5">
  {decision.escalationReason !== null ? <div>
    <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Escalation reason</dt>
    <dd className="mt-2 text-sm leading-6">{decision.escalationReason}</dd>
  </div> : null}
  <div>
    <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{decision.recommendationSource === 'escalation-reason' ? 'Recommendation provenance' : 'Recommendation'}</dt>
    <dd className="mt-2 text-sm leading-6">{decision.recommendationSource === 'escalation-reason'
      ? 'The recommendation field was initialized from the escalation reason. No separate recommendation is recorded.'
      : decision.recommendation}</dd>
  </div>
  <div>
    <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Why it matters</dt>
    <dd className="mt-2 text-sm leading-6">{decision.impact}</dd>
  </div>
</dl>
