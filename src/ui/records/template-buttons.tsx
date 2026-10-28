import { useState } from 'react'
import { RECORD_SCHEMA_ENTITY_ID, type EntitySchema, type RecordRow } from '../../domains/records/contracts'
import type { RecordTemplateButton } from '../../domains/records/templates/buttons.server'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'
import { ViewSheet } from './view-sheet'

/** Mounted within Record actions; discovery itself never creates a record. */
export function TemplateButtons({ schema, record }: { schema: EntitySchema; record: RecordRow }) {
  const buttons = useResource<RecordTemplateButton[]>(`/api/v1/apps/${schema.appId}/entities/${schema.id}/template-buttons`, { refreshMs: 30000 })
  const [confirming, setConfirming] = useState<RecordTemplateButton | null>(null)
  const command = useCommand<RecordRow>(`record-template-button:${record.ref.appId}:${record.ref.entityId}:${record.id}`)
  const busy = ['submitting', 'pending', 'unknown'].includes(command.result.state)
  async function run(button: RecordTemplateButton, confirmed: boolean) {
    const created = await command.submit('/api/v1/commands/record.template-button-run', { appId: schema.appId, entityId: schema.id, buttonId: button.id, confirmed, ref: record.ref }, [
      { ref: record.ref, version: record.version },
      { ref: { appId: schema.appId, entityId: RECORD_SCHEMA_ENTITY_ID, recordId: schema.id }, version: schema.version },
    ])
    if (created) setConfirming(null)
  }
  return <div className="cr-stack" role="group" aria-label="Template buttons">
    <ResourceState resource={buttons.resource} operation="template buttons" retry={buttons.refresh}>{items => <>
      {items.length > 0 && <div className="cr-actions">{items.map(button => <button type="button" key={button.id} className="cr-button cr-button--quiet" disabled={busy || !button.enabled} onClick={() => {
        command.reset()
        if (button.confirmation) setConfirming(button)
        else void run(button, false)
      }}>{button.name}</button>)}</div>}
      {items.some(button => !button.enabled) && <p className="cr-muted">Unavailable buttons require current access to create all template records and read their sources.</p>}
    </>}</ResourceState>
    {!confirming && <CommandFeedback {...command} />}
    {command.result.state === 'committed' && <a className="cr-link" href={`/app/records/${command.result.value.ref.appId}/${command.result.value.ref.entityId}/${command.result.value.id}`}>Open created record</a>}
    <ViewSheet open={!!confirming} onClose={() => { if (!busy) setConfirming(null) }} title={confirming ? `Confirm ${confirming.name}` : 'Confirm template button'}>
      {confirming && <><p>Create a new record and its configured child records using this template?</p><div className="cr-actions"><button type="button" className="cr-button" disabled={busy} onClick={() => void run(confirming, true)}>{confirming.name}</button><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button></div><CommandFeedback {...command} /></>}
    </ViewSheet>
  </div>
}
