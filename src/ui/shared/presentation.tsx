import type { Page } from '../../contracts/primitives'
import type { EntitySchema } from '../../domains/records/contracts'
import { useResource } from './api'
import { useSyncExternalStore, type ReactNode } from 'react'
import type { Freshness, Impact, Money } from '../../contracts/primitives'
import type { MutationState, Resource } from './api'

export function money(value: Money) {
  const negative = value.minor.startsWith('-')
  const digits = value.minor.replace('-', '').padStart(value.scale + 1, '0')
  const whole = (value.scale ? digits.slice(0, -value.scale) : digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '−' : ''}${value.currency === 'AUD' ? 'A$' : `${value.currency} `}${whole}${value.scale ? `.${digits.slice(-value.scale)}` : ''}`
}
const noTimestampSubscription = () => () => {}
/** False on the server and while hydrating, so the first client render repeats the server's UTC bytes. */
export const useLocalTime = () => useSyncExternalStore(noTimestampSubscription, () => true, () => false)
/** The viewer's own zone at an instant, as Intl names it for their locale ("AEST", "GMT+10", "UTC"), never an IANA id. */
export const zoneName = (date: Date) => new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date).find(part => part.type === 'timeZoneName')!.value
export function Timestamp({ value, zone = false }: { value: string | null; zone?: boolean }) {
  // First document/client render uses identical UTC bytes; localize after hydration.
  const client = useLocalTime()
  // Each value names its own zone (daylight saving can split one column); the no-break space keeps it beside the time.
  return value ? <time dateTime={value}>{client ? `${new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}${zone ? `\u00a0${zoneName(new Date(value))}` : ''}` : new Date(value).toISOString()}</time> : <span>Not recorded</span>
}
const stateTone = { loading: '', signed_out: 'cr-tag--access', forbidden: 'cr-tag--access', not_found: 'cr-tag--warn', failed: 'cr-tag--error' } as const
export function ResourceState<T>({ resource, operation, retry, children }: { resource: Resource<T>; operation: string; retry: () => void; children: (data: T) => ReactNode }) {
  if (resource.state === 'ready') return <>{children(resource.data)}</>
  const titles = { loading: `Loading ${operation}`, signed_out: 'Please sign in again', forbidden: 'This work is outside your access', not_found: `${operation} is unavailable`, failed: `Could not load ${operation}` }
  return <section className="cr-state" aria-live="polite" aria-busy={resource.state === 'loading'}><span className={`cr-tag ${stateTone[resource.state]}`}>{resource.state === 'loading' ? 'One moment' : 'Current state'}</span><h2>{titles[resource.state]}</h2>{'error' in resource && <p>{resource.error.message}</p>}{resource.state === 'signed_out' ? <a className="cr-button" href="/signin">Sign in</a> : resource.state === 'failed' ? <button className="cr-button" onClick={retry}>Try reading again</button> : null}</section>
}
export function Empty({ title, children, action, headingLevel = 3 }: { title: string; children: ReactNode; action?: ReactNode; headingLevel?: 2 | 3 | 4 }) {
  const Heading = headingLevel === 2 ? 'h2' : headingLevel === 4 ? 'h4' : 'h3'
  return <section className="cr-empty"><Heading>{title}</Heading><p>{children}</p>{action}</section>
}
export function CommandFeedback<T>({ result, reconcile, retryOriginal }: { result: MutationState<T>; reconcile: () => void; retryOriginal?: () => void }) {
  if (result.state === 'idle') return null
  return <div className={`cr-notice cr-notice--${result.state}`} role="status">{result.state === 'submitting' ? 'Submitting your decision…' : result.state === 'committed' ? 'Saved.' : result.state === 'cancelled' ? 'Cancelled. We’re checking anything already in progress.' : result.state === 'failed' ? result.error.message : result.state === 'unknown' && result.checkIssue === 'signed_out' ? 'Sign in again to check your original submission. Its outcome is not confirmed.' : result.state === 'unknown' && result.checkIssue === 'access_changed' ? 'Your access changed. The original submission is retained; this does not mean work already in progress was stopped.' : result.state === 'unknown' && result.checkIssue === 'not_found' ? 'The original submission has not been found yet. Check again, or explicitly retry that same request.' : result.state === 'pending' ? 'Received and being handled. We’ll show the result when it is confirmed.' : 'We’re checking whether your submission went through. You don’t need to submit it again.'}{(result.state === 'unknown' || result.state === 'pending') && <button className="cr-button cr-button--quiet" onClick={reconcile}>Check status</button>}{result.state === 'unknown' && result.checkIssue === 'signed_out' && <a className="cr-link" href="/signin">Sign in</a>}{result.state === 'unknown' && result.checkIssue === 'not_found' && retryOriginal && <button className="cr-button cr-button--quiet" onClick={retryOriginal}>Retry original request</button>}{result.state === 'failed' && result.error.detail.currentVersions && <p>The record changed. Refresh and review the current version before confirming again.</p>}</div>
}
export function FreshnessNote({ value }: { value: Freshness }) { return <div className="cr-freshness"><span>Evidence as of <Timestamp value={value.asOf} /> · {value.sourcesKnown}{value.sourcesExpected === null ? ' known sources; total coverage not measured' : ` of ${value.sourcesExpected} sources`}</span>{value.staleSourceIds.length > 0 && <p>{value.staleSourceIds.length} sources need refreshing.</p>}{value.unknowns.map((unknown, i) => <p key={i}>{unknown}</p>)}</div> }
export function Consequences({ value, fieldLabels, appId }: { value: Impact; fieldLabels?: Record<string, string>; appId?: string }) {
  const ownerApp = appId ?? value.affected[0]?.appId
  const schemas = useResource<Page<EntitySchema>>(value.egress.length && ownerApp && !fieldLabels ? `/api/v1/apps/${ownerApp}/entities` : null)
  const labels = fieldLabels ?? (schemas.resource.state === 'ready' ? Object.fromEntries(schemas.resource.data.items.flatMap(schema => schema.fields.map(field => [field.id, field.label]))) : undefined)
  return <div className="cr-consequences"><p>{value.summary}</p>{value.spend.length > 0 && <p><strong>Proposed spend: {value.spend.map(money).join(' + ')}</strong></p>}{value.commitments.map((item, i) => <p key={`c${i}`}>{item}</p>)}{value.accessChanges.map((item, i) => <p key={`a${i}`}>Access: {item}</p>)}{value.egress.map((item, i) => <p key={`e${i}`}>Data sent to {item.destination}: {item.fields.map(id => labels?.[id]).filter(Boolean).length === item.fields.length ? item.fields.map(id => labels![id]).join(', ') : 'field scope needs a named review before authorization'}. Purpose: {item.purpose}</p>)}{value.uncertainty.map((item, i) => <p key={`u${i}`}>Unknown: {item}</p>)}</div> }
