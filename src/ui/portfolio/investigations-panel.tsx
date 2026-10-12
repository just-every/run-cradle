import { useEffect, useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { InvestigationCatalogueItem } from '../../domains/intelligence/service-contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, Empty, money, ResourceState } from '../shared/presentation'
export function InvestigationsPanel({ appId, problemId }: { appId: string; problemId: string }) {
  const choices = useResource<Page<InvestigationCatalogueItem>>(`/api/v1/investigations?appId=${appId}`, { refreshMs: 5000 })
  return <details className="cr-detail"><summary>Resolve important unknowns</summary><ResourceState resource={choices.resource} operation="proposed investigations" retry={choices.refresh}>{page => <>{page.items.filter(item => item.problemId === problemId).map(item => <Investigation key={`${item.id}:${item.version}`} item={item} onChanged={choices.refresh} />)}{!page.items.some(item => item.problemId === problemId) && <Empty title="No investigation proposed">Existing evidence should be checked before commissioning more work.</Empty>}</>}</ResourceState></details>
}
function Investigation({ item, onChanged }: { item: InvestigationCatalogueItem; onChanged: () => void }) {
  const [confirmed, setConfirmed] = useState(false)
  const command = useCommand<{ id: string; state: string }>(`investigation:${item.id}`)
  const permission = item.allowedActions.find(action => action.action === 'investigation.start')
  useEffect(() => { if (command.result.state === 'committed') onChanged() }, [command.result.state])
  return <article className="cr-card"><h3>{item.label}</h3><p>{item.description}</p><p>{item.state}</p><p>Investigation cost: {item.cost.length ? item.cost.map(money).join(' + ') : `${item.valuedCost.amount} ${item.valuedCost.unit}`}</p><details><summary>Evidence already checked</summary>{item.prerequisites.evidenceAlreadyChecked.map((value, index) => <p key={index}>{value}</p>)}</details>{permission?.reason && <p className="cr-notice">{permission.reason}</p>}{permission?.enabled && <><label className="cr-choice"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Authorize this investigation within its stated cost and scope.</label><button className="cr-button" disabled={!confirmed || !['idle','failed'].includes(command.result.state)} onClick={() => void command.submit('/api/v1/investigations/start', { investigationId: item.id, decisionId: permission.requiredDecisionId }, [])}>Start investigation</button></>}<CommandFeedback {...command} /></article>
}
