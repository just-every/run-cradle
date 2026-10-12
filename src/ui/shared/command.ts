import { useEffect, useRef, useState } from 'react'
import type { CommandInput, CommandResult, CommandStatus } from '../../contracts/primitives'
import { createUlid } from '../../core/shared/ids'
import { readApi, RequestFailure } from './api'
type CheckIssue = 'signed_out' | 'access_changed' | 'not_found'
type Original = { url: string; body: CommandInput<unknown>; workspaceId: string; memberId: string }
export type MutationState<T> = { state: 'idle' } | { state: 'submitting'; commandId: string } | { state: 'committed'; commandId: string; value: T } | { state: 'pending' | 'unknown' | 'cancelled'; commandId: string; checkIssue?: CheckIssue; runId?: string; statusUrl?: string } | { state: 'failed'; commandId: string; error: RequestFailure }
const unresolved = (state: MutationState<unknown>['state']) => ['submitting', 'pending', 'unknown'].includes(state)
const problem = (message: string) => new RequestFailure(0, { requestId: '', operation: 'command', code: 'internal', message, retry: 'read' })
export function useCommand<T>(storageKey?: string) {
  const busy = useRef(false)
  const original = useRef<Original | null>(null)
  const persistence = useRef<string | null>(null)
  const current = useRef<MutationState<T>>({ state: 'idle' })
  const [result, setState] = useState<MutationState<T>>(current.current)
  function setResult(next: MutationState<T>) {
    current.current = next; busy.current = unresolved(next.state)
    if (persistence.current) try { if (busy.current && original.current) sessionStorage.setItem(persistence.current, JSON.stringify(original.current)); else sessionStorage.removeItem(persistence.current) } catch { /* In-memory identity remains; the interface does not claim device retention. */ }
    setState(next)
  }
  async function identify() {
    const { data } = await readApi<{ member: { id: string }; workspace: { id: string } }>('/api/v1/session')
    return { memberId: data.member.id, workspaceId: data.workspace.id }
  }
  const restoring = useRef<Promise<void> | null>(null)
  function restore() {
    if (!restoring.current) restoring.current = (async () => {
      if (!storageKey) return
      const owner = await identify()
      persistence.current = `cradle-command:${owner.workspaceId}:${owner.memberId}:${storageKey}`
      const stored = sessionStorage.getItem(persistence.current)
      if (!stored) return
      const parsed = JSON.parse(stored) as Original
      if (parsed.workspaceId !== owner.workspaceId || parsed.memberId !== owner.memberId || typeof parsed.body?.commandId !== 'string' || !parsed.url?.startsWith('/api/v1/')) throw problem('The saved submission cannot be verified.')
      original.current = parsed; setResult({ state: 'unknown', commandId: parsed.body.commandId })
    })().catch(() => { /* Submission performs a fresh identity check; no saved request is exposed to another session. */ })
    return restoring.current
  }
  useEffect(() => { void restore() }, [storageKey])
  async function send(request: Original) {
    const commandId = request.body.commandId
    setResult({ state: 'submitting', commandId })
    try {
      const { data } = await readApi<CommandResult<T>>(request.url, { method: 'POST', body: JSON.stringify(request.body) })
      if (data.commandId !== commandId) throw problem('The response did not match this submission.')
      if (data.state === 'committed') { setResult({ state: 'committed', commandId, value: data.value }); return data.value }
      if (data.state !== 'accepted') throw problem('The submission returned an unreadable result.')
      setResult({ state: 'pending', commandId, runId: data.runId, statusUrl: data.statusUrl })
    } catch (error) {
      const failure = error instanceof RequestFailure ? error : problem('The outcome could not be confirmed.')
      setResult(failure.status === 401 || failure.status === 403 ? { state: 'unknown', commandId, checkIssue: failure.status === 401 ? 'signed_out' : 'access_changed' } : failure.status === 0 || failure.status >= 500 ? { state: 'unknown', commandId } : { state: 'failed', commandId, error: failure })
    }
  }
  async function submit<Input>(url: string, input: Input, expected: CommandInput<Input>['expected'], controlEpoch?: number) {
    if (busy.current) return
    busy.current = true
    await restore()
    if (unresolved(current.current.state)) return
    busy.current = true
    const commandId = createUlid()
    try {
      const owner = await identify()
      if (storageKey) persistence.current = `cradle-command:${owner.workspaceId}:${owner.memberId}:${storageKey}`
      original.current = { ...owner, url, body: { commandId, expected, input, ...(controlEpoch === undefined ? {} : { controlEpoch }) } }
      return await send(original.current)
    } catch (error) { setResult({ state: 'failed', commandId, error: error instanceof RequestFailure ? error : problem('Your session could not be verified. The submission was not sent.') }) }
  }
  async function reconcile() {
    const active = current.current
    if (!('commandId' in active)) return
    const commandId = active.commandId
    try {
      const { data } = await readApi<CommandStatus>(`/api/v1/commands/${encodeURIComponent(commandId)}`)
      if (data.commandId !== commandId) throw problem('The status did not match the original submission.')
      if (data.state === 'committed') setResult({ state: 'committed', commandId, value: data.result as T })
      else if (data.state === 'cancelled') setResult({ state: 'cancelled', commandId })
      else if (data.state === 'failed' && data.failure) setResult({ state: 'failed', commandId, error: new RequestFailure(409, data.failure) })
      else setResult({ state: data.state === 'unknown' || data.state === 'partial' ? 'unknown' : 'pending', commandId, ...(data.runId ? { runId: data.runId } : {}) })
    } catch (error) {
      const status = error instanceof RequestFailure ? error.status : 0
      setResult({ state: 'unknown', commandId, ...(status === 401 ? { checkIssue: 'signed_out' as const } : status === 403 ? { checkIssue: 'access_changed' as const } : status === 404 ? { checkIssue: 'not_found' as const } : {}) })
    }
  }
  async function retryOriginal() {
    if (current.current.state !== 'unknown' || current.current.checkIssue !== 'not_found' || !original.current) return
    const request = original.current
    try {
      const owner = await identify()
      if (owner.memberId !== request.memberId || owner.workspaceId !== request.workspaceId) throw problem('Sign in to the original workspace account before retrying.')
      await send(request)
    } catch { setResult({ state: 'unknown', commandId: request.body.commandId, checkIssue: 'access_changed' }) }
  }
  const activeCommandId = 'commandId' in result ? result.commandId : null
  const checkIssue = 'checkIssue' in result ? result.checkIssue : undefined
  useEffect(() => {
    if ((result.state !== 'unknown' && result.state !== 'pending') || checkIssue) return
    let stopped = false, checks = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = async () => { if (stopped || !navigator.onLine) return; await reconcile(); if (!stopped && ++checks < 5) timer = setTimeout(check, [1000, 2000, 5000, 10000, 20000][checks]) }
    timer = setTimeout(check, 500)
    const online = () => { clearTimeout(timer); checks = 0; void check() }
    window.addEventListener('online', online)
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('online', online) }
  }, [result.state, activeCommandId, checkIssue])
  return { result, submit, reconcile, retryOriginal, reset: () => { if (['failed', 'committed', 'cancelled'].includes(current.current.state)) { original.current = null; setResult({ state: 'idle' }) } } }
}
