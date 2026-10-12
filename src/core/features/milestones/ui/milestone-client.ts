import { sessionFetch } from '../../../../ui/shared/session-fetch'
import { useRef } from 'react'
import { useInitialDocumentValue } from '../../../app/document-data'
import { useEffect, useReducer, useState } from 'react'

export type Milestone = {
  id: string
  title: string
  campaign: { id: string; name: string; code: string }
  owner: { id: string; name: string; initials: string }
  type: string
  status: string
  startDate: string
  endDate: string | null
  predecessors: Array<{ id: string; title: string }>
  dependencyConflict: boolean
  conflictReason: string | null
  version: number
}

export class MilestoneApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

type State<T> = { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'failed'; error: MilestoneApiError } | { kind: 'not-found' } | { kind: 'signed-out' }

const asRecord = (value: unknown, label: string) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MilestoneApiError(`${label} returned an invalid response.`, 502)
  return value as Record<string, unknown>
}

const text = (value: Record<string, unknown>, key: string, label: string) => {
  if (typeof value[key] !== 'string') throw new MilestoneApiError(`${label} omitted ${key}.`, 502)
  return value[key] as string
}

const nullableText = (value: Record<string, unknown>, key: string, label: string) => {
  if (value[key] === null) return null
  return text(value, key, label)
}

const milestone = (value: unknown): Milestone => {
  const source = asRecord(value, 'Milestone')
  const campaign = asRecord(source.campaign, 'Milestone campaign')
  const owner = asRecord(source.owner, 'Milestone owner')
  if (!Array.isArray(source.predecessors) || typeof source.dependencyConflict !== 'boolean' || typeof source.version !== 'number') throw new MilestoneApiError('Milestone returned an invalid response.', 502)
  return {
    id: text(source, 'id', 'Milestone'), title: text(source, 'title', 'Milestone'), owner: { id: text(owner, 'id', 'Milestone owner'), name: text(owner, 'name', 'Milestone owner'), initials: text(owner, 'initials', 'Milestone owner') }, type: text(source, 'type', 'Milestone'), status: text(source, 'status', 'Milestone'), startDate: text(source, 'startDate', 'Milestone'), endDate: nullableText(source, 'endDate', 'Milestone'), dependencyConflict: source.dependencyConflict, conflictReason: nullableText(source, 'conflictReason', 'Milestone'), version: source.version,
    campaign: { id: text(campaign, 'id', 'Milestone campaign'), name: text(campaign, 'name', 'Milestone campaign'), code: text(campaign, 'code', 'Milestone campaign') },
    predecessors: source.predecessors.map((item) => { const predecessor = asRecord(item, 'Milestone predecessor'); return { id: text(predecessor, 'id', 'Milestone predecessor'), title: text(predecessor, 'title', 'Milestone predecessor') } }),
  }
}

const request = async (path: string) => {
  const response = await sessionFetch(path)
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? (payload as { error?: { message?: unknown } }).error : undefined
    throw new MilestoneApiError(typeof error?.message === 'string' ? error.message : `Request to ${path} failed.`, response.status)
  }
  return asRecord(payload, 'API')
}

const useLoad = <T>(key: string, load: () => Promise<T>, initial: T | undefined): [State<T>, () => void] => {
  const [revision, retry] = useReducer((current) => current + 1, 0)
  const [state, setState] = useState<State<T>>(() => initial === undefined ? { kind: 'loading' } : { kind: 'ready', value: initial })
  const mounted = useRef(false)
  useEffect(() => { if (!mounted.current) { mounted.current = true; if (initial !== undefined) return } let active = true; setState({ kind: 'loading' }); void load().then((value) => { if (active) setState({ kind: 'ready', value }) }, (error: unknown) => { if (!active) return; if (error instanceof MilestoneApiError && error.status === 404) return setState({ kind: 'not-found' }); if (error instanceof MilestoneApiError && error.status === 401) return setState({ kind: 'signed-out' }); setState({ kind: 'failed', error: error instanceof MilestoneApiError ? error : new MilestoneApiError('The milestone request failed.', 0) }) }); return () => { active = false } }, [key, revision])
  return [state, retry]
}

const decodeTimeline = (payload: unknown) => {
  const source = asRecord(payload, 'Timeline')
  if (!Array.isArray(source.milestones) || (source.scale !== 'month' && source.scale !== 'quarter')) throw new MilestoneApiError('Timeline returned an invalid response.', 502)
  return { milestones: source.milestones.map(milestone), scale: source.scale as 'month' | 'quarter', timezone: text(source, 'timezone', 'Timeline') }
}
export const useTimeline = () => useLoad('milestone-timeline', async () => decodeTimeline(await request('/api/milestones/timeline')), useInitialDocumentValue('/api/milestones/timeline', decodeTimeline))
export const useMilestoneDetail = (id: string) => useLoad(`milestone:${id}`, async () => milestone((await request(`/api/milestones/${encodeURIComponent(id)}`)).milestone), useInitialDocumentValue(`/api/milestones/${encodeURIComponent(id)}`, (value) => milestone(asRecord(value, 'Milestone').milestone)))
