import { formatDate } from '../../portfolio/ui/portfolio-format'
import { useMemo, useState, type ReactNode } from 'react'

import { useTimeline, type Milestone } from './milestone-client'

const month = (date: string) => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

const PageState = ({ title, message, retry }: { title: string; message: ReactNode; retry?: () => void }) => <section className="grid min-h-80 place-items-center rounded-xl border border-border bg-card p-8 text-center"><div className="max-w-md space-y-3"><h1 className="text-xl font-extrabold">{title}</h1><p className="text-sm text-muted-foreground">{message}</p>{retry ? <button className="rounded-md border border-border px-3 py-2 text-sm font-bold" onClick={retry}>Retry</button> : null}</div></section>

const eventClass = (milestone: Milestone) => milestone.status === 'Blocked' || milestone.status === 'At risk' ? 'border-red-300 bg-red-50 text-red-800' : milestone.status === 'Watch' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'

export const TimelineLensPage = () => {
  const [state, retry] = useTimeline()
  const [mode, setMode] = useState<'month' | 'quarter'>('month')
  const currentMilestones = state.kind === 'ready' ? state.value.milestones : []
  const columns = useMemo(() => {
    if (currentMilestones.length === 0) return []
    const start = Math.min(...currentMilestones.map((milestone) => new Date(`${milestone.startDate}T00:00:00Z`).getTime()))
    const end = Math.max(...currentMilestones.map((milestone) => new Date(`${(milestone.endDate ?? milestone.startDate)}T00:00:00Z`).getTime()))
    const result: Array<{ label: string; from: number; to: number }> = []
    const cursor = new Date(start)
    cursor.setUTCDate(1)
    while (cursor.getTime() <= end) {
      const from = cursor.getTime()
      const next = new Date(from)
      if (mode === 'month') next.setUTCMonth(next.getUTCMonth() + 1)
      else next.setUTCMonth(next.getUTCMonth() + 3)
      result.push({ label: mode === 'month' ? month(cursor.toISOString().slice(0, 10)) : `Q${Math.floor(cursor.getUTCMonth() / 3) + 1} ${cursor.getUTCFullYear()}`, from, to: next.getTime() })
      cursor.setTime(next.getTime())
    }
    return result
  }, [currentMilestones, mode])
  if (state.kind === 'loading') return <PageState title="Loading Timeline Lens" message="Reading current milestones in workspace time." />
  if (state.kind === 'signed-out') return <PageState title="Sign in required" message={<a className="cr-link font-bold text-primary underline" href="/signin">Sign in to continue.</a>} />
  if (state.kind === 'not-found') return <PageState title="Timeline Lens is unavailable" message="Restore the shipped timeline lens from Settings before trying again." />
  if (state.kind === 'failed') return <PageState title="Could not load Timeline Lens" message={state.error.message} retry={retry} />
  const milestones = state.value.milestones
  if (milestones.length === 0) return <PageState title="No milestones in Timeline Lens" message="Create a milestone on an active campaign to begin planning the launch path." />
  const rangeStart = columns[0].from
  const rangeEnd = columns.at(-1)!.to
  const percent = (value: string) => ((new Date(`${value}T00:00:00Z`).getTime() - rangeStart) / (rangeEnd - rangeStart)) * 100
  return <main className="space-y-5" aria-labelledby="timeline-title"><section className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5 md:flex-row md:items-center"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Saved Lens · {state.value.timezone}</p><h1 className="mt-1 text-2xl font-extrabold" id="timeline-title">Timeline Lens</h1><p className="mt-2 text-sm text-muted-foreground">Every milestone on an active campaign, positioned from its actual date or range.</p></div><div className="flex rounded-md border border-border p-1"><button className={`rounded px-3 py-2 text-sm font-bold ${mode === 'month' ? 'bg-primary text-primary-foreground' : ''}`} onClick={() => setMode('month')}>Month</button><button className={`rounded px-3 py-2 text-sm font-bold ${mode === 'quarter' ? 'bg-primary text-primary-foreground' : ''}`} onClick={() => setMode('quarter')}>Quarter</button></div></section><section className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block"><div className="min-w-[900px]"><div className="grid grid-cols-[15rem_1fr] border-b border-border"><span className="p-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Campaign</span><div className="grid" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(8rem, 1fr))` }}>{columns.map((column) => <span className="border-l border-border p-3 text-xs font-bold text-muted-foreground" key={column.label}>{column.label}<small role="group" className="mt-2 flex justify-between" aria-label={`Dates in ${column.label}`}>{[1,8,15,22,29].filter(day => day <= new Date(column.to - 86400000).getUTCDate()).map(day => <span key={day}>{day}</span>)}</small></span>)}</div></div>{milestones.map((milestone) => { const start = percent(milestone.startDate); const end = percent(milestone.endDate ?? milestone.startDate); const left = Math.max(0, Math.min(100, start)); const width = Math.max(1.8, Math.min(100 - left, end - start || 3.5)); return <div className="grid min-h-24 grid-cols-[15rem_1fr] border-b border-border last:border-b-0" key={milestone.id}><div className="p-3"><a className="cr-link font-bold underline-offset-2 hover:underline" href={`/app/campaigns/${encodeURIComponent(milestone.campaign.id)}`}>{milestone.campaign.name}</a><p className="mt-1 text-xs text-muted-foreground">{milestone.owner.name} · {milestone.type}</p></div><div className="relative bg-[linear-gradient(to_right,transparent_calc(100%_-_1px),var(--border)_1px)] bg-[length:calc(100%/${columns.length})_100%]" role="group" aria-label={`${milestone.title}, ${formatDate(milestone.startDate)}${milestone.endDate ? ` through ${formatDate(milestone.endDate)}` : ''}`}><p className="p-2 text-xs">{formatDate(milestone.startDate)}{milestone.endDate ? ` – ${formatDate(milestone.endDate)}` : ''}</p><a className={`absolute top-12 flex min-h-9 min-w-7 items-center gap-2 rounded-md border px-2 text-xs font-bold ${eventClass(milestone)}`} href={`/app/milestones/${encodeURIComponent(milestone.id)}`} style={{ left: `${left}%`, width: `${width}%` }}><span>{milestone.title}</span>{milestone.dependencyConflict ? <span role="img" aria-label="Dependency conflict">⚠</span> : null}</a></div></div> })}</div></section><section className="grid gap-3 md:hidden" aria-label="Milestone agenda">{milestones.map((milestone) => <a className="grid grid-cols-[5rem_1fr] gap-3 rounded-xl border border-border bg-card p-4" href={`/app/milestones/${encodeURIComponent(milestone.id)}`} key={milestone.id}><time dateTime={milestone.startDate} className="text-xs font-bold text-muted-foreground">{formatDate(milestone.startDate)}</time><span><strong className="block">{milestone.title}</strong><span className="mt-1 block text-xs text-muted-foreground">{milestone.campaign.name} · {milestone.owner.name}{milestone.endDate ? ` · ends ${formatDate(milestone.endDate)}` : ''}</span>{milestone.dependencyConflict ? <span className="mt-2 inline-block text-xs font-bold text-red-700">Dependency conflict</span> : null}</span></a>)}</section></main>
}
