import { useEffect, useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { EntitySchema } from '../../domains/records/contracts'
import { AUTHORITY_ENTITY_IDS, type Grant } from '../../domains/authority/contracts'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'
export function IssueGrant({ grant, onChanged }: { grant: Grant; onChanged: () => void }) {
  const schemas = useResource<Page<EntitySchema>>(`/api/v1/apps/${grant.appId}/entities`)
  const [confirmed, setConfirmed] = useState(false)
  useEffect(() => setConfirmed(false), [grant.version, grant.impactHash])
  const command = useCommand(`issue-grant:${grant.id}`)
  useEffect(() => { if (command.result.state === 'committed') onChanged() }, [command.result.state])
  return <ResourceState resource={schemas.resource} operation="named authority scope" retry={schemas.refresh}>{page => {
    const known = grant.scope.every(scope => page.items.some(schema => schema.id === scope.entityId)) && grant.providerScopes.every(scope => scope.fields.every(id => page.items.some(schema => schema.fields.some(field => field.id === id))))
    return <section className="cr-detail"><h4>Confirm this authority separately</h4><ul>{grant.scope.map((scope, index) => <li key={index}>{page.items.find(schema => schema.id === scope.entityId)?.label ?? 'Record type unavailable'} · {scope.recordIds ? `${scope.recordIds.length} selected records` : scope.filter ? 'Records matching the prepared condition' : 'All permitted records of this type'}</li>)}</ul>{grant.providerScopes.map((scope, index) => <p key={index}>Data permitted outside Cradle: {scope.fields.map(id => page.items.flatMap(schema => schema.fields).find(field => field.id === id)?.label ?? 'Field unavailable').join(', ')}. Purpose: {scope.purposes.join(', ')}.</p>)}{!known && <p className="cr-error">The complete named scope is unavailable. Refresh before authorizing.</p>}<label className="cr-choice"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!known} /><span>Authorize this exact scope, limits and expiry.</span></label><button className="cr-button" disabled={!known || !confirmed || !grant.impactHash || !grant.allowedActions?.some(action => action.action === 'grant.issue' && action.enabled) || Date.parse(grant.expiresAt) <= Date.now() || !['idle', 'failed'].includes(command.result.state)} onClick={() => void command.submit('/api/v1/commands/grant.issue', { grantId: grant.id, confirmedImpactHash: grant.impactHash }, [{ ref: { appId: grant.appId, entityId: AUTHORITY_ENTITY_IDS.grant, recordId: grant.id }, version: grant.version }])}>Authorize operation</button><CommandFeedback {...command} /></section>
  }}</ResourceState>
}
