import { useDocumentData } from '../../core/app/document-data'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Failure, Success } from '../../contracts/primitives'
import { sessionFetch, SessionFailure } from './session-fetch'

export class RequestFailure extends Error {
  constructor(readonly status: number, readonly detail: Failure['error']) { super(detail.message) }
}
export type Resource<T> = { state: 'loading'; data: null } | { state: 'ready'; data: T } | { state: 'signed_out' | 'forbidden' | 'not_found' | 'failed'; data: null; error: RequestFailure }
const failure = (message: string, operation: string) => new RequestFailure(0, { requestId: '', operation, code: 'internal', message, retry: 'read' })
export async function readApi<T>(url: string, init?: RequestInit, signal?: AbortSignal): Promise<Success<T>> {
  let response: Response
  try { response = await sessionFetch(url, { ...init, signal, headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } }) }
  catch (error) { if (error instanceof SessionFailure) throw new RequestFailure(error.status, { requestId: '', operation: url, code: error.status === 401 ? 'signed_out' : 'forbidden', message: error.message, retry: 'after_change' }); throw failure(error instanceof Error ? error.message : 'The request could not reach Cradle.', url) }
  let body: unknown
  try { body = await response.json() } catch { throw failure('The server returned an unreadable response.', url) }
  if (!response.ok) {
    if (body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'message' in body.error) throw new RequestFailure(response.status, body.error as Failure['error'])
    throw new RequestFailure(response.status, { requestId: '', operation: url, code: 'internal', message: `Request returned ${response.status}.`, retry: 'read' })
  }
  if (!body || typeof body !== 'object' || !('data' in body) || !('meta' in body)) throw failure('The server returned an invalid versioned response.', url)
  return body as Success<T>
}
export function useResource<T>(url: string | null, options: { refreshMs?: number } = {}) {
  const document = useDocumentData()
  const seeded = url && Object.prototype.hasOwnProperty.call(document, url) ? document[url] as Success<T> : null
  const initialConsumed = useRef(false)
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState<{ url: string | null; resource: Resource<T> }>(() => ({ url, resource: seeded ? { state: 'ready', data: seeded.data } : { state: 'loading', data: null } }))
  const quietRefresh = useRef(false)
  const inFlight = useRef(false)
  const accessPaused = useRef(false)
  const refresh = useCallback(() => {
    accessPaused.current = false
    // Explicit invalidation and its caller's UI transition share one render.
    // Do not mount children from the old snapshot before the effect clears it.
    if (!quietRefresh.current) setLoaded({ url, resource: { state: 'loading', data: null } })
    setRevision(value => value + 1)
  }, [url])
  useEffect(() => {
    if (!initialConsumed.current) { initialConsumed.current = true; if (seeded) return }
    const abort = new AbortController()
    if (!quietRefresh.current) setLoaded({ url, resource: { state: 'loading', data: null } })
    quietRefresh.current = false
    inFlight.current = !!url
    if (url) readApi<T>(url, undefined, abort.signal).then(({ data }) => { if (!abort.signal.aborted) setLoaded({ url, resource: { state: 'ready', data } }) }, (error: unknown) => {
      if (abort.signal.aborted) return
      const problem = error instanceof RequestFailure ? error : failure('Unable to read current data.', url)
      accessPaused.current = problem.status === 401 || problem.status === 403
      setLoaded({ url, resource: { state: problem.status === 401 ? 'signed_out' : problem.status === 403 ? 'forbidden' : problem.status === 404 ? 'not_found' : 'failed', data: null, error: problem } })
    }).finally(() => { if (!abort.signal.aborted) inFlight.current = false })
    return () => { abort.abort(); inFlight.current = false }
  }, [url, revision])
  useEffect(() => {
    if (!url || !options.refreshMs) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let checks = 0
    function schedule() {
      if (timer) clearTimeout(timer)
      if (globalThis.document.visibilityState !== 'visible' || !navigator.onLine || accessPaused.current) return
      timer = setTimeout(() => { checks++; if (!inFlight.current) { quietRefresh.current = true; refresh() }; schedule() }, checks < 60 ? options.refreshMs : Math.max(options.refreshMs!, 30000))
    }
    function resume() { checks = 0; schedule() }
    function sessionChanged() { accessPaused.current = false; resume() }
    globalThis.document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    window.addEventListener('cradle-session-changed', sessionChanged)
    window.addEventListener('offline', schedule)
    schedule()
    return () => { if (timer) clearTimeout(timer); globalThis.document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); window.removeEventListener('cradle-session-changed', sessionChanged); window.removeEventListener('offline', schedule) }
  }, [url, options.refreshMs, refresh])
  const resource: Resource<T> = loaded.url === url ? loaded.resource : { state: 'loading', data: null }
  return { resource, refresh }
}

export { useCommand, type MutationState } from './command'
