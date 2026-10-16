import { sessionFetch } from '../../../../ui/shared/session-fetch'
import { useRef } from 'react'
import { useInitialDocumentValue } from '../../../app/document-data'
import { useCallback, useEffect, useReducer, useState } from 'react'

export type CampaignReference = {
  id: string
  name: string
  code: string
  launchDate: string
}

export type RiskRecord = {
  id: string
  title: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  state: 'Watching' | 'In progress' | 'Needs decision' | 'Escalated' | 'Resolved'
  owner: { id: string; name: string; initials: string }
  dueDate: string | null
  signal: string
  mitigation: string
  campaign: CampaignReference
  version: number
  resolvedAt: string | null
  linkedDecision: { id: string; title: string } | null
  resolutionNote: string | null
}

export type RiskLensResponse = {
  id: string
  risks: RiskRecord[]
  total: number | string
  name: string
  description: string
}

export class RiskApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }
}

type ResourceState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; value: T }
  | { kind: 'failed'; error: RiskApiError }
  | { kind: 'not-found' }
  | { kind: 'signed-out' }

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RiskApiError(`The ${label} response was not an object.`, 502, 'invalid_response')
  }
  return value as Record<string, unknown>
}

const string = (source: Record<string, unknown>, key: string, label: string) => {
  const value = source[key]
  if (typeof value !== 'string') {
    throw new RiskApiError(`The ${label} response omitted ${key}.`, 502, 'invalid_response')
  }
  return value
}

const nullableString = (source: Record<string, unknown>, key: string, label: string) => {
  const value = source[key]
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new RiskApiError(`The ${label} response has an invalid ${key}.`, 502, 'invalid_response')
  }
  return value
}

const number = (source: Record<string, unknown>, key: string, label: string) => {
  const value = source[key]
  if (typeof value !== 'number') {
    throw new RiskApiError(`The ${label} response omitted ${key}.`, 502, 'invalid_response')
  }
  return value
}

const risk = (value: unknown): RiskRecord => {
  const source = record(value, 'risk')
  const campaign = record(source.campaign, 'risk campaign')
  const owner = record(source.owner, 'risk owner')
  const severity = string(source, 'severity', 'risk') as RiskRecord['severity']
  const state = string(source, 'state', 'risk') as RiskRecord['state']

  if (!['Low', 'Medium', 'High', 'Critical'].includes(severity)) {
    throw new RiskApiError('The risk response has an invalid severity.', 502, 'invalid_response')
  }
  if (!['Watching', 'In progress', 'Needs decision', 'Escalated', 'Resolved'].includes(state)) {
    throw new RiskApiError('The risk response has an invalid state.', 502, 'invalid_response')
  }

  return {
    linkedDecision: source.linkedDecision ? { id: string(record(source.linkedDecision, 'linked decision'), 'id', 'linked decision'), title: string(record(source.linkedDecision, 'linked decision'), 'title', 'linked decision') } : null,
    id: string(source, 'id', 'risk'),
    title: string(source, 'title', 'risk'),
    severity,
    state,
    owner: {
      id: string(owner, 'id', 'risk owner'),
      name: string(owner, 'name', 'risk owner'),
      initials: string(owner, 'initials', 'risk owner'),
    },
    dueDate: nullableString(source, 'dueDate', 'risk'),
    signal: string(source, 'signal', 'risk'),
    mitigation: string(source, 'mitigation', 'risk'),
    campaign: {
      id: string(campaign, 'id', 'risk campaign'),
      name: string(campaign, 'name', 'risk campaign'),
      code: string(campaign, 'code', 'risk campaign'),
      launchDate: string(campaign, 'launchDate', 'risk campaign'),
    },
    version: number(source, 'version', 'risk'),
    resolvedAt: nullableString(source, 'resolvedAt', 'risk'),
    resolutionNote: nullableString(source, 'resolutionNote', 'risk'),
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await sessionFetch(path, {
    headers: { 'content-type': 'application/json', ...init?.headers },
    ...init,
  })
  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error?: { code?: unknown; message?: unknown } }).error
      : undefined
    throw new RiskApiError(
      typeof error?.message === 'string' ? error.message : `Request to ${path} failed.`,
      response.status,
      typeof error?.code === 'string' ? error.code : 'request_failed',
    )
  }

  return payload as T
}

const decodeLens = (payload: unknown): RiskLensResponse => {
  const response = record(payload, 'risks lens')
  if (!Array.isArray(response.risks)) {
    throw new RiskApiError('The risks lens response omitted risks.', 502, 'invalid_response')
  }
  const total = response.total
  if (typeof total !== 'number' && typeof total !== 'string') {
    throw new RiskApiError('The risks lens response omitted total.', 502, 'invalid_response')
  }
  return {
    id: string(response, 'id', 'risks lens'),
    risks: response.risks.map(risk),
    total,
    name: string(response, 'name', 'risks lens'),
    description: string(response, 'description', 'risks lens'),
  }
}

const loadRisk = async (id: string) => {
  const response = record(await request<unknown>(`/api/risks/${encodeURIComponent(id)}`), 'risk detail')
  return risk({ ...record(response.risk, 'risk'), linkedDecision: response.decision ?? null })
}

const useResource = <T>(key: string, load: () => Promise<T>, initial: T | undefined): [ResourceState<T>, () => void] => {
  const [revision, retry] = useReducer((value) => value + 1, 0)
  const [state, setState] = useState<ResourceState<T>>(() => initial === undefined ? { kind: 'loading' } : { kind: 'ready', value: initial })

  const mounted = useRef(false)
  useEffect(() => { if (!mounted.current) { mounted.current = true; if (initial !== undefined) return }
    let active = true
    setState({ kind: 'loading' })
    void load().then(
      (value) => { if (active) setState({ kind: 'ready', value }) },
      (error: unknown) => {
        if (!active) return
        if (error instanceof RiskApiError && error.status === 404) return setState({ kind: 'not-found' })
        if (error instanceof RiskApiError && error.status === 401) return setState({ kind: 'signed-out' })
        setState({ kind: 'failed', error: error instanceof RiskApiError ? error : new RiskApiError('The risks request failed.', 0, 'request_failed') })
      },
    )
    return () => { active = false }
  }, [key, revision])

  return [state, retry]
}

export const useRiskLens = () => useResource('risks-lens', async () => decodeLens(await request('/api/risks/lens')), useInitialDocumentValue('/api/risks/lens', decodeLens))

export const useRiskDetail = (id: string) => useResource(`risk:${id}`, () => loadRisk(id), useInitialDocumentValue(`/api/risks/${encodeURIComponent(id)}`, (value) => risk({ ...record(record(value, 'risk detail').risk, 'risk'), linkedDecision: record(value, 'risk detail').decision ?? null })))

export const escalateRisk = async (id: string, version: number, reason: string) => {
  const response = record(await request<unknown>(`/api/risks/${encodeURIComponent(id)}/escalate`, {
    method: 'POST',
    body: JSON.stringify({ version, reason }),
  }), 'risk escalation')
  return risk({ ...record(response.risk, 'risk'), linkedDecision: response.decision ?? null })
}

export const useRiskAction = () => {
  const [error, setError] = useState<RiskApiError | null>(null)
  const [isPending, setPending] = useState(false)
  const run = useCallback(async (action: () => Promise<void>) => {
    setError(null)
    setPending(true)
    try {
      await action()
      return true
    } catch (caught) {
      setError(caught instanceof RiskApiError ? caught : new RiskApiError('The risk action failed.', 0, 'request_failed'))
      return false
    } finally {
      setPending(false)
    }
  }, [])

  return { error, isPending, run }
}
