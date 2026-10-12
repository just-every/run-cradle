import { useEffect, useState } from 'react'
import type { Strategy, StrategyDecisionChoice } from '../../domains/intelligence/service-contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'
export function StrategyDecision({ strategy, onChanged }: { strategy: Strategy; onChanged: () => void }) {
  const decisions = useResource<StrategyDecisionChoice[]>(`/api/v1/strategies/${strategy.id}/decisions`)
  const command = useCommand<Strategy>(`strategy-accept:${strategy.id}`)
  const [choice, setChoice] = useState(''), [confirmed, setConfirmed] = useState(false)
  useEffect(() => { setChoice(''); setConfirmed(false) }, [strategy.version, strategy.expiresAt])
  useEffect(() => { if (command.result.state === 'committed') onChanged() }, [command.result.state])
  const stale = strategy.state === 'stale' || strategy.check.state === 'stale' || strategy.check.state === 'infeasible' || Date.parse(strategy.expiresAt) <= Date.now()
  if (strategy.state === 'accepted') return <p className="cr-notice">This strategy was accepted under its recorded authority. Individual commitments still need current authorization.</p>
  return <ResourceState resource={decisions.resource} operation="strategy authority" retry={decisions.refresh}>{items => <form className="cr-form" onSubmit={event => { event.preventDefault(); const decision = items.find(item => item.id === choice); if (decision && confirmed && !stale) void command.submit('/api/v1/strategies/accept', { strategyId: strategy.id, decisionId: decision.id }, decision.expected) }}><label className="cr-field">Approved business decision<select required value={choice} disabled={stale} onChange={event => { setChoice(event.target.value); setConfirmed(false) }}><option value="">Choose an approved decision</option>{items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>{!items.length && <p>No current approved decision authorizes this strategy. <a href="/app/approvals" className="cr-link">Review decisions</a>.</p>}<label className="cr-choice"><input type="checkbox" checked={confirmed} disabled={stale} onChange={event => setConfirmed(event.target.checked)} />Accept this exact strategy and its stated conditions.</label><button className="cr-button" disabled={stale || !choice || !confirmed || !['idle','failed'].includes(command.result.state)}>Accept strategy</button><CommandFeedback {...command} /></form>}</ResourceState>
}
