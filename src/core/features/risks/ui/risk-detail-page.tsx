import { RiskEscalationNotice } from './risk-escalation-notice'
import { formatDate } from '../../portfolio/ui/portfolio-format'
import { useState, type FormEvent, type ReactNode } from 'react'

import { escalateRisk, useRiskAction, useRiskDetail } from './risk-client'

const DetailState = ({ title, message, retry }: { title: string; message: ReactNode; retry?: () => void }) => <section className="grid min-h-80 place-items-center rounded-xl border border-border bg-card p-8 text-center"><div className="max-w-md space-y-3"><h1 className="text-xl font-extrabold">{title}</h1><p className="text-sm text-muted-foreground">{message}</p>{retry ? <button className="rounded-md border border-border px-3 py-2 text-sm font-bold" onClick={retry}>Retry</button> : null}</div></section>

export const RiskDetailPage = ({ riskId }: { riskId: string }) => {
  const [state, retry] = useRiskDetail(riskId)
  const [confirmation, setConfirmation] = useState<{ id: string; title: string } | null | undefined>(undefined)
  const [reason, setReason] = useState('')
  const action = useRiskAction()
  if (state.kind === 'loading') return <DetailState title="Loading risk" message="Fetching this risk and its linked campaign." />
  if (state.kind === 'signed-out') return <DetailState title="Sign in required" message={<><a className="cr-link font-bold text-primary underline" href="/signin">Sign in</a> to open this risk.</>} />
  if (state.kind === 'not-found') return <DetailState title="Risk not found" message="It may have been deleted or you may have followed an outdated link." />
  if (state.kind === 'failed') return <DetailState title="Could not load risk" message={state.error.message} retry={retry} />
  const risk = state.value
  const canEscalate = risk.state !== 'Resolved' && risk.state !== 'Escalated'
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) return
    if (await action.run(async () => { const result = await escalateRisk(risk.id, risk.version, reason.trim()); setConfirmation(result.linkedDecision) })) {
      setReason('')
      retry()
    }
  }
  return <main className="mx-auto max-w-5xl space-y-5" aria-labelledby="risk-title"><>{confirmation !== undefined && <RiskEscalationNotice decision={confirmation} />}{risk.linkedDecision && confirmation === undefined && <p><a className="cr-link underline" href={`/app/decisions/${encodeURIComponent(risk.linkedDecision.id)}`}>Linked decision: {risk.linkedDecision.title}</a></p>}</><a className="cr-link text-sm font-bold text-primary underline-offset-2 hover:underline" href={`/app/campaigns/${encodeURIComponent(risk.campaign.id)}`}>← Back to {risk.campaign.name}</a><section className="rounded-xl border border-border bg-card p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{risk.campaign.code} · Risk</p><h1 className="mt-2 text-3xl font-extrabold" id="risk-title">{risk.title}</h1><p className="mt-3 text-sm text-muted-foreground">Owned by {risk.owner.name} · {risk.dueDate ? `Due ${formatDate(risk.dueDate)}` : 'No due date'}</p></div><div className="flex h-fit flex-wrap gap-2"><span className="rounded-full bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{risk.severity}</span><span className="rounded-full bg-background px-3 py-2 text-sm font-bold">{risk.state}</span></div></div><dl className="mt-6 grid gap-5 border-t border-border pt-5 md:grid-cols-2"><div><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Signal</dt><dd className="mt-2 text-sm leading-6">{risk.signal}</dd></div><div><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Mitigation</dt><dd className="mt-2 text-sm leading-6">{risk.mitigation}</dd></div></dl></section>{risk.state === 'Resolved' ? <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="font-bold text-emerald-900">Resolved</h2><p className="mt-2 text-sm text-emerald-800">{risk.resolutionNote ?? 'Resolution details are recorded in campaign activity.'}</p></section> : null}{canEscalate ? <form className="rounded-xl border border-border bg-card p-5" onSubmit={submit}><h2 className="text-lg font-bold">Escalate this risk</h2><p className="mt-1 text-sm text-muted-foreground">This records the reason and may create one linked Critical decision under the workspace policy.</p><label className="mt-4 grid gap-2 text-sm font-bold" htmlFor="risk-escalation-reason">Reason<textarea className="min-h-24 rounded-md border border-border bg-background px-3 py-2 font-normal" id="risk-escalation-reason" value={reason} onChange={(event) => setReason(event.target.value)} required /></label>{action.error ? <p className="mt-3 text-sm font-semibold text-red-700">{action.error.message}</p> : null}<button className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50" disabled={action.isPending || !reason.trim()}>{action.isPending ? 'Escalating…' : 'Escalate risk'}</button></form> : null}</main>
}
