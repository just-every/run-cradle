import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { Page } from '../../../../contracts/primitives'
import { LAUNCH_APP_ID } from '../../../../apps/launch/contracts'
import { useResource } from '../../../../ui/shared/api'
import { SchemaBuilderPanel, newBase, type BuilderTarget } from '../../../../ui/records/schema/schema-builder'
import { ResourceBoundary } from '../../../app/ui/operator'
import { useAppStudioReady } from '../../../app/ui/operator/operator-shell'
import { activityActions } from './activity-presentation'
import { decodePortfolio, useApiResource } from './portfolio-api'
import { formatDateTime } from './portfolio-format'
import { PortfolioPageShell, useOperatorSession } from './portfolio-page-shell'
import './home-page.css'

type BaseChange = { id: string; name: string; occurredAt: string; href: string }
type BaseSummary = {
  id: string; name: string; entryUrl: string; tableCount: number; recordCount: number;
  latestChange: BaseChange | null;
}
type HomeActivity = { id: string; name: string; detail: string; occurredAt: string; href?: string }

export const HomePage = () => {
  const session = useOperatorSession()
  const portfolio = useApiResource('/api/portfolio', decodePortfolio)
  const bases = useResource<Page<BaseSummary>>('/api/v1/apps', { refreshMs: 30000 })
  const appStudioReady = useAppStudioReady()
  const [builder, setBuilder] = useState<BuilderTarget | null>(null)

  if (session.resource.state !== 'ready') return <ResourceBoundary state={session.resource.state} operation="operator session" error="Your session could not be loaded. Try again." onRetry={session.retry} />
  const evaluatedAt = bases.resource.state === 'ready' ? bases.resource.data.evaluatedAt : ''
  const workspace = session.resource.data.workspace
  const launch = portfolio.resource.state === 'ready' ? portfolio.resource.data : null
  const activity: HomeActivity[] = [
    ...activityActions(launch?.recentActivity ?? []).map(entry => ({
      id: entry.id,
      name: entry.subjectTitle || entry.description,
      detail: [entry.actor?.name, entry.subjectTitle ? entry.description.replace(` “${entry.subjectTitle}”`, '') : ''].filter(Boolean).join(' · '),
      occurredAt: entry.occurredAt,
    })),
    ...(bases.resource.state === 'ready' ? bases.resource.data.items.flatMap(base => base.latestChange ? [{
      ...base.latestChange, id: `${base.id}:${base.latestChange.id}`, detail: base.name,
    }] : []) : []),
  ].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id.localeCompare(a.id)).slice(0, 10)

  return <PortfolioPageShell currentPath="/app" title="Home" session={session.resource.data}
    actions={appStudioReady ? <Link className="cr-button cr-button--quiet" to="/app/operations/studio">App studio</Link> : undefined}>
    <div className="cr-home">
      <section className="cr-home-section" aria-labelledby="home-bases-title">
        <header><h2 id="home-bases-title">Your bases</h2>{!builder && (bases.resource.state !== 'ready' || bases.resource.data.items.length > 0) && <Link className="cr-home-action" to="/app/records" search={{ import: 'base', job: undefined, receipt: undefined }}>Import a base</Link>}</header>
        {builder ? <SchemaBuilderPanel target={builder} onTarget={setBuilder} onClose={() => setBuilder(null)} /> :
          bases.resource.state !== 'ready' ? <ResourceBoundary state={bases.resource.state === 'signed_out' ? 'signed-out' : bases.resource.state === 'not_found' ? 'not-found' : bases.resource.state} operation="your bases" error="Your bases could not be loaded. Try again." onRetry={bases.refresh} /> : bases.resource.data.items.length ?
            <ul className="cr-home-bases">{bases.resource.data.items.map(base => <li key={base.id}>
              <Link className="cr-home-row" to={base.entryUrl} aria-label={base.name} aria-describedby={`base-summary-${base.id}`}>
                <strong>{base.name}</strong>
                <span id={`base-summary-${base.id}`} className="cr-home-meta">{base.id === LAUNCH_APP_ID && launch ? <>{quantity(launch.metrics.liveCampaigns, 'live campaign')} · <span className={launch.metrics.needsAttention ? 'cr-home-attention' : undefined}>{launch.metrics.needsAttention} need attention</span></> :
                  <>{quantity(base.tableCount, 'table')} · {quantity(base.recordCount, 'record')}{base.latestChange ? ` · changed ${changedAge(base.latestChange.occurredAt, evaluatedAt)}` : ''}</>}
                </span>
              </Link>
            </li>)}</ul> :
            <div className="cr-home-empty"><p>No bases yet.</p><button className="cr-button" onClick={() => setBuilder(newBase())}>New base</button></div>}
      </section>
      <section className="cr-home-section" aria-labelledby="home-activity-title">
        <header><h2 id="home-activity-title">Recent activity</h2></header>
        {portfolio.resource.state !== 'ready' && portfolio.resource.state !== 'forbidden' && <ResourceBoundary state={portfolio.resource.state} operation="launch activity" error="Recent activity could not be loaded. Try again." onRetry={portfolio.retry} />}
        {activity.length ? <ol className="cr-home-activity">{activity.map(entry => <li key={entry.id}>
          {entry.href ? <Link className="cr-home-row" to={entry.href} aria-label={entry.name} aria-describedby={`activity-detail-${entry.id}`}><strong>{entry.name}</strong><ActivityLine entry={entry} timezone={workspace.timezone} /></Link> :
            <div className="cr-home-row"><strong>{entry.name}</strong><ActivityLine entry={entry} timezone={workspace.timezone} /></div>}
        </li>)}</ol> : portfolio.resource.state !== 'loading' && <p className="cr-home-empty">No recent activity.</p>}
      </section>
    </div>
  </PortfolioPageShell>
}

function ActivityLine({ entry, timezone }: { entry: HomeActivity; timezone: string }) {
  return <span className="cr-home-meta" id={`activity-detail-${entry.id}`}>{entry.detail && `${entry.detail} · `}<time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt, timezone)}</time></span>
}
function quantity(value: number, name: string) { return `${value.toLocaleString('en-US')} ${name}${value === 1 ? '' : 's'}` }
function changedAge(value: string, evaluatedAt: string) {
  const minutes = Math.max(0, Math.floor((Date.parse(evaluatedAt) - Date.parse(value)) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ago`
  return `${Math.floor(minutes / 1440)} d ago`
}
