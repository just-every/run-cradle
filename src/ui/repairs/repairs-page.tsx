import { RepairOperationActions } from './operation-actions'
import { CompletionReview } from './completion-review'
import { useEffect, useState } from 'react'
import type { Page } from '../../contracts/primitives'
import type { RecordRow } from '../../domains/records/contracts'
import { ContractorSelection } from './contractor-selection'
import { contractorReference } from './navigation'
import type { Repair } from '../../apps/repairs/contracts'
import { REPAIRS_APP_ID, REPAIR_ENTITIES, repairFieldId } from '../../apps/repairs/model'
import { OperatorFeaturePage } from '../../core/app/screens/operator-feature-page'
import { readApi, RequestFailure, useResource, type Resource } from '../shared/api'
import { Empty, ResourceState, Timestamp } from '../shared/presentation'
import { CellDisplay } from '../records/record-fields'
import { ManualQuotes } from './manual-quotes'
export function RepairsPage({ repairId }: { repairId?: string }) {
  return <OperatorFeaturePage currentPath="/app/repairs" title=""><div className="cr-page">{repairId ? <RepairDetail id={repairId} /> : <RepairList />}</div></OperatorFeaturePage>
}
function RepairList() {
  const [resource, setResource] = useState<Resource<Page<RecordRow>>>({ state: 'loading', data: null })
  const [revision, setRevision] = useState(0)
  const [cursor, setCursor] = useState<string>()
  useEffect(() => {
    const abort = new AbortController(); setResource({ state: 'loading', data: null })
    const url = `/api/v1/apps/${REPAIRS_APP_ID}/entities/${REPAIR_ENTITIES.workOrders}/query`
    readApi<Page<RecordRow>>(url, { method: 'POST', body: JSON.stringify({ limit: 40, ...(cursor ? { cursor } : {}) }) }, abort.signal).then(({ data }) => { if (!abort.signal.aborted) setResource({ state: 'ready', data }) }, cause => { if (abort.signal.aborted) return; const error = cause instanceof RequestFailure ? cause : new RequestFailure(0, { code: 'internal', message: 'Repairs could not be loaded.', requestId: '', operation: url, retry: 'read' }); setResource({ state: error.status === 401 ? 'signed_out' : error.status === 403 ? 'forbidden' : 'failed', data: null, error }) })
    return () => abort.abort()
  }, [revision, cursor])
  return <><header className="cr-page-header"><div><p className="cr-eyebrow">From first report to verified repair</p><h1>Repairs</h1></div><a className="cr-button" href="/app/repairs/new">Report a problem</a></header><ResourceState resource={resource} operation="repairs" retry={() => setRevision(value => value + 1)}>{page => <>{page.items.length ? <div className="cr-stack">{page.items.map(record => <article key={record.id} className="cr-card"><span className="cr-tag">{record.lifecycle.replaceAll('_', ' ')}</span><h2><CellDisplay cell={record.fields[repairFieldId('workOrders', 'asset_id')]} /></h2><p><CellDisplay cell={record.fields[repairFieldId('workOrders', 'store_id')]} /></p><p className="cr-muted">Updated <Timestamp value={record.updatedAt} /></p><a className="cr-link" href={`/app/repairs/${record.id}`}>Open repair →</a></article>)}</div> : <Empty title="No repairs to show">Report a problem when something needs attention.</Empty>}{page.nextCursor && <button className="cr-button cr-button--quiet" onClick={() => setCursor(page.nextCursor!)}>More repairs</button>}</>}</ResourceState></>
}
function RepairDetail({ id }: { id: string }) {
  const repair = useResource<Repair>(`/api/v1/repairs/${id}`, { refreshMs: 5000 })
  return <><a className="cr-link" href="/app/repairs">← Repairs</a><ResourceState resource={repair.resource} operation="repair" retry={repair.refresh}>{data => <><header className="cr-page-header"><div><p className="cr-eyebrow">{data.stage.replaceAll('_', ' ')}</p><h1><CellDisplay cell={data.workOrder.fields[repairFieldId('workOrders', 'asset_id')]} /></h1><p><CellDisplay cell={data.workOrder.fields[repairFieldId('workOrders', 'store_id')]} /></p></div><button className="cr-button cr-button--quiet" onClick={repair.refresh}>Refresh</button></header>{data.blockers.map((blocker, index) => <p className="cr-notice" key={index}>{blocker}</p>)}<div className="cr-actions" style={{marginBottom:16}}><a className="cr-link" href={`/app/cases/${data.case.id}`}>Repair controls →</a></div>{['triage','quotes','rework'].includes(data.stage) && <ContractorSelection id={id} current={contractorReference(data.workOrder.fields[repairFieldId('workOrders','contractor_id')])} onChanged={repair.refresh} />}{data.stage === 'approval' && <p><a className="cr-button" href="/app/approvals">Review required decision</a></p>}{data.stage === 'store_acceptance' && <CompletionReview repairId={id} onChanged={repair.refresh} />}<ManualQuotes id={id} /><RepairOperationActions repair={data} onChanged={repair.refresh} />{data.storeAcceptance && <section className="cr-card"><h2>Store check</h2><p>{data.storeAcceptance.accepted ? 'The store accepted the repair.' : 'The store reported that further work is needed.'}</p>{data.storeAcceptance.reason && <p>{data.storeAcceptance.reason}</p>}<p>Checked <Timestamp value={data.storeAcceptance.at} /> against completion claim version {data.storeAcceptance.claimVersion}.</p></section>}{data.accounting.state !== 'not_ready' && <section className="cr-card"><h2>Accounting handoff</h2><p>{data.accounting.state === 'handed_off' ? 'Handed off to accounting. This is not a payment confirmation.' : data.accounting.state === 'unknown' ? 'The handoff result is not yet confirmed. Cradle must check the original attempt before sending again.' : data.accounting.state === 'pending' ? 'Accounting handoff is in progress.' : data.accounting.state === 'unconfigured' ? 'The accounting connection needs configuration.' : 'Accounting did not accept this handoff.'}</p></section>}<details className="cr-detail"><summary>Record and technical trace</summary><a href={`/app/records/${REPAIRS_APP_ID}/${REPAIR_ENTITIES.workOrders}/${data.workOrder.id}`}>Open work order record</a><p>Case {data.case.id}; control version {data.case.controlEpoch}.</p></details></>}</ResourceState></>
}
