import { useEffect } from 'react'
import type { TimelineBaseline, View } from '../../domains/records/contracts'
import { RECORD_VIEW_ENTITY_ID } from '../../domains/records/contracts'
import { useCommand } from '../shared/api'
import { Timestamp, CommandFeedback } from '../shared/presentation'

export function TimelineBaselineControl({ view, baseline, loading }: { view: View; baseline?: TimelineBaseline; loading: boolean }) {
  const command = useCommand<View>(`timeline-baseline:${view.id}`)
  useEffect(() => {
    if (command.result.state === 'committed') {
      window.dispatchEvent(new Event('records-changed')); window.dispatchEvent(new Event('record-views-changed'))
    }
  }, [command.result.state])
  const capture = () => {
    const { id, version, createdAt: _created, updatedAt: _updated, access: _access, timelineBaseline: _baseline, ...definition } = view
    void command.submit('/api/v1/commands/view.save', { id, view: definition, captureBaseline: true }, [{ ref: { appId: view.appId, entityId: RECORD_VIEW_ENTITY_ID, recordId: id }, version }])
  }
  return <div className="cr-timeline-baseline-controls">
    <div className="cr-actions"><button type="button" className="cr-button cr-button--quiet" disabled={loading || view.access?.canEdit === false || !['idle', 'failed', 'committed', 'cancelled'].includes(command.result.state)} onClick={capture}>{baseline ? 'Replace baseline' : 'Capture baseline'}</button>
      <p className="cr-muted">{baseline ? <>Baseline captured <Timestamp value={baseline.capturedAt} />. Grey bars show the saved plan.</> : 'Capture the current planned dates to compare later changes.'}</p></div>
    <CommandFeedback {...command} />
  </div>
}
