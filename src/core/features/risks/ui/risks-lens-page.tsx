import { ExportLaunchCsv } from '../../../../ui/launch/export-launch-csv'
import {AnalysisPanel} from '../../../../ui/launch/analysis-panel'
import { RiskEscalationNotice } from './risk-escalation-notice'
import { formatDate } from '../../portfolio/ui/portfolio-format'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

import { escalateRisk, useRiskAction, useRiskLens, type RiskRecord } from './risk-client'

const tone = (severity: RiskRecord['severity']) => ({
  Critical: 'border-red-300 bg-red-50 text-red-800',
  High: 'border-amber-300 bg-amber-50 text-amber-900',
  Medium: 'border-amber-200 bg-amber-50 text-amber-800',
  Low: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}[severity])

const State = ({ title, children, retry }: { title: string; children: ReactNode; retry?: () => void }) => (
  <section className="grid min-h-72 place-items-center rounded-xl border border-border bg-card p-8 text-center">
    <div className="max-w-md space-y-3"><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-muted-foreground">{children}</p>{retry ? <button className="rounded-md border border-border px-3 py-2 text-sm font-semibold" onClick={retry}>Retry</button> : null}</div>
  </section>
)

const RiskCard = ({ risk, onEscalated }: { risk: RiskRecord; onEscalated: (risk: RiskRecord) => void }) => {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])
  const [isComposerOpen, setComposerOpen] = useState(false)
  const [reason, setReason] = useState('')
  const action = useRiskAction()
  const canEscalate = risk.state !== 'Resolved' && risk.state !== 'Escalated'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) return
    let updated: RiskRecord | undefined
    const succeeded = await action.run(async () => { updated = await escalateRisk(risk.id, risk.version, reason.trim()) })
    if (succeeded) {
      setComposerOpen(false)
      setReason('')
      onEscalated(updated!)
    }
  }

  return <article className={`flex min-h-64 flex-col gap-4 rounded-xl border p-5 ${tone(risk.severity)}`}>
    <header className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><span className="rounded-full border border-current/20 bg-white/70 px-2 py-1 text-xs font-bold">{risk.severity}</span><span className="rounded-full border border-current/20 bg-white/70 px-2 py-1 text-xs font-bold">{risk.state}</span></div><span className="text-right text-xs font-semibold">{risk.dueDate ? `Due ${formatDate(risk.dueDate)}` : 'No due date'}</span></header>
    <div><h2 className="text-lg font-bold text-foreground"><a className="cr-link underline-offset-2 hover:underline" href={`/app/risks/${encodeURIComponent(risk.id)}`}>{risk.title}</a></h2><p className="mt-2 text-sm text-muted-foreground"><a className="cr-link font-semibold text-foreground underline-offset-2 hover:underline" href={`/app/campaigns/${encodeURIComponent(risk.campaign.id)}`}>{risk.campaign.name}</a> · {risk.owner.name}</p></div>
    <dl className="grid gap-3 text-sm"><div><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Signal</dt><dd className="mt-1 text-foreground">{risk.signal}</dd></div><div><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Mitigation</dt><dd className="mt-1 text-foreground">{risk.mitigation}</dd></div></dl>
    <footer className="mt-auto flex items-center justify-between gap-3"><a className="cr-link text-sm font-bold text-primary underline-offset-2 hover:underline" href={`/app/campaigns/${encodeURIComponent(risk.campaign.id)}`}>Open campaign</a>{canEscalate ? <button className="rounded-md border border-current/30 bg-white/80 px-3 py-2 text-sm font-bold text-foreground disabled:opacity-50" disabled={!hydrated} onClick={() => setComposerOpen((open) => !open)}>Escalate</button> : <span className="text-xs font-bold">{risk.state === 'Escalated' ? 'Already escalated' : 'Resolved'}</span>}</footer>
    {isComposerOpen ? <form className="border-t border-current/20 pt-4" onSubmit={submit}><label className="grid gap-2 text-sm font-bold" htmlFor={`risk-reason-${risk.id}`}>Escalation reason<textarea className="min-h-20 rounded-md border border-current/30 bg-white px-3 py-2 font-normal text-foreground" id={`risk-reason-${risk.id}`} value={reason} onChange={(event) => setReason(event.target.value)} required /></label>{action.error ? <p className="mt-2 text-sm font-semibold text-red-800">{action.error.message}</p> : null}<div className="mt-3 flex justify-end gap-2"><button className="px-3 py-2 text-sm font-semibold" type="button" onClick={() => setComposerOpen(false)}>Cancel</button><button className="rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50" disabled={action.isPending || !reason.trim()}>{action.isPending ? 'Escalating…' : 'Confirm escalation'}</button></div></form> : null}
  </article>
}

export const RisksLensPage = () => {
  const [confirmation, setConfirmation] = useState<{ id: string; title: string } | null | undefined>(undefined)
  const [state, retry] = useRiskLens()
  if (state.kind === 'loading') return <State title="Loading Risks Lens">Evaluating the shipped risk conditions against the current portfolio.</State>
  if (state.kind === 'signed-out') return <State title="Sign in required">Your session has ended. <a className="cr-link font-bold text-primary underline" href="/signin">Sign in to continue.</a></State>
  if (state.kind === 'not-found') return <State title="Risks Lens is unavailable">The shipped lens could not be found. Restore it from settings before trying again.</State>
  if (state.kind === 'failed') return <State title="Could not load Risks Lens" retry={retry}>{state.error.message}</State>
  if (state.value.risks.length === 0) return <main className="space-y-5"><State title="No risks need attention">No open High or Critical risks on active campaigns currently match the 30-day launch window.</State><AnalysisPanel feature="risk-readout" lensId={state.value.id}/></main>

  const lens = state.value
  return <main className="space-y-5" aria-labelledby="risks-lens-title">{confirmation !== undefined && <RiskEscalationNotice decision={confirmation} />}<section className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5 lg:flex-row lg:items-center"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Saved Lens</p><h1 className="mt-1 text-2xl font-extrabold" id="risks-lens-title">{lens.name}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{lens.description}</p></div><div className="flex flex-wrap items-center gap-2 text-xs font-bold"><ExportLaunchCsv params={{ source: 'shipped-lens', key: 'risks' }} /><span className="rounded-full border border-border bg-background px-3 py-2">Open risks</span><span className="rounded-full border border-border bg-background px-3 py-2">High or Critical</span><span className="rounded-full border border-border bg-background px-3 py-2">Launch ≤ 30 days</span></div></section><section className="grid gap-4 "><div><p className="mb-3 text-sm font-semibold text-muted-foreground">{lens.total} matching {lens.total === 1 ? 'risk' : 'risks'}</p><div className="grid gap-3 md:grid-cols-2">{lens.risks.map((risk) => <RiskCard key={risk.id} risk={risk} onEscalated={result => { setConfirmation(result.linkedDecision); retry() }} />)}</div></div><AnalysisPanel feature="risk-readout" lensId={lens.id}/></section></main>
}
