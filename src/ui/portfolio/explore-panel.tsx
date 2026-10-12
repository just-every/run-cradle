import { useEffect, useState } from 'react'
import type { CellValue, Money } from '../../contracts/primitives'
import type { Exploration } from '../../domains/intelligence/service-contracts'
import { MoneyInput } from '../records/money-input'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState, Timestamp } from '../shared/presentation'
export function ExplorePanel({ problemId, onChanged }: { problemId: string; onChanged: () => void }) {
  const [budget, setBudget] = useState<CellValue>(null)
  const [branches, setBranches] = useState(2)
  const [confirmed, setConfirmed] = useState(false)
  const command = useCommand<Exploration>(`portfolio-explore:${problemId}`)
  useEffect(() => { if (command.result.state === 'committed') onChanged() }, [command.result.state])
  const ceiling = budget && typeof budget === 'object' && !Array.isArray(budget) && 'minor' in budget ? budget as Money : null
  return <details className="cr-detail"><summary>Investigate alternatives</summary><form className="cr-form" onSubmit={event => { event.preventDefault(); if (ceiling) void command.submit('/api/v1/portfolio/explore', { problemId, maximumBranches: branches, maximumCost: ceiling }, []) }}><p>Compare alternatives using the current permitted evidence. Analysis has a separate cost limit; this gives no permission to purchase, book a visit or contact a supplier.</p><div className="cr-field"><label htmlFor="field-analysis-budget">Maximum analysis cost</label><MoneyInput field={{ id: 'analysis-budget', label: 'Maximum analysis cost', type: 'money', required: true, unique: false }} value={budget} onChange={value => { setBudget(value); setConfirmed(false) }} /></div><label className="cr-field">Maximum alternatives<input type="number" min={1} max={8} value={branches} onChange={event => { setBranches(Number(event.target.value)); setConfirmed(false) }} /></label><label className="cr-choice"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Use current evidence and spend up to this analysis limit.</span></label><button className="cr-button" disabled={!ceiling || !confirmed || !Number.isInteger(branches) || branches < 1 || branches > 8 || !['idle', 'failed'].includes(command.result.state)}>Investigate alternatives</button><CommandFeedback {...command} />{command.result.state === 'committed' && <ExplorationStatus id={command.result.value.id} onChanged={onChanged} />}</form></details>
}
function ExplorationStatus({ id, onChanged }: { id: string; onChanged: () => void }) {
  const current = useResource<Exploration>(`/api/v1/explorations/${id}`, { refreshMs: 5000 })
  const completed = current.resource.state === 'ready' ? current.resource.data.completedAt : null
  useEffect(() => { if (completed) onChanged() }, [completed])
  return <ResourceState resource={current.resource} operation="alternative investigation" retry={current.refresh}>{value => <section><p>{value.completedAt ? `${value.strategyIds.length} independently checked alternatives.` : 'Investigation is in progress.'} Started <Timestamp value={value.startedAt} />{value.completedAt && <>; completed <Timestamp value={value.completedAt} /></>}.</p>{value.failures.map((failure, index) => <p className="cr-notice" key={index}>{failure.message}</p>)}</section>}</ResourceState>
}
