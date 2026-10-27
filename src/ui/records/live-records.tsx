import { useCallback, useEffect, useRef, useState } from 'react'
import { useDocumentSession } from '../../core/app/document-context'
import { Tooltip } from '../shared/tooltip'
import { readApi, RequestFailure, type Resource } from '../shared/api'

type Presence = { participants: { id: string; name: string }[]; revision: number; accessRevision: string }

/** Frequent authority checks leave read/render time inside the two-second live-update budget. */
export function useLiveRecords<T>(url: string, input: unknown, presenceUrl: string | null, restart: () => void, refreshKey = 0) {
  const identity = JSON.stringify(input)
  const key = JSON.stringify([url, identity, presenceUrl])
  const [loaded, setLoaded] = useState<{ key: string; resource: Resource<T> }>({ key, resource: { state: 'loading', data: null } })
  const setResource = (resource: Resource<T>) => setLoaded({ key, resource })
  const [participants, setParticipants] = useState<Presence['participants']>([])
  const [notice, setNotice] = useState('Connecting to live updates…')
  const requestRefresh = useRef<() => void>(() => {})
  const restartRef = useRef(restart); restartRef.current = restart
  const refresh = useCallback(() => requestRefresh.current(), [])
  const reload = useCallback(() => { setLoaded({ key, resource: { state: 'loading', data: null } }); requestRefresh.current() }, [key])
  useEffect(() => {
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined, running = false, paused = false, previous: number | undefined, previousAccess: string | undefined, requested = 0, completed = -1
    setResource({ state: 'loading', data: null }); setParticipants([]); setNotice('Connecting to live updates…')
    if (!presenceUrl) return
    const heartbeatUrl = presenceUrl
    function failed(error: unknown) {
      const problem = error instanceof RequestFailure ? error : new RequestFailure(0, { requestId: '', operation: 'Live records', code: 'internal', message: error instanceof Error ? error.message : 'Could not refresh records.', retry: 'read' })
      setResource({ state: problem.status === 401 ? 'signed_out' : problem.status === 403 ? 'forbidden' : problem.status === 404 ? 'not_found' : 'failed', data: null, error: problem })
      setParticipants([]); setNotice('Live updates unavailable.'); requested++
      paused = [401, 403, 404].includes(problem.status)
      if (problem.detail.code === 'stale_cursor') { window.dispatchEvent(new Event('records-live-changed')); setNotice('Records changed. Returned to the first page.'); restartRef.current() }
    }
    async function tick() {
      if (running || paused || abort.signal.aborted || document.visibilityState !== 'visible' || !navigator.onLine) return
      running = true
      const started = Date.now()
      try {
        const { data: presence } = await readApi<Presence>(heartbeatUrl, { method: 'POST', body: '{}' }, abort.signal)
        if (abort.signal.aborted) return
        setParticipants(presence.participants)
        if (requested !== completed || presence.revision !== previous || presence.accessRevision !== previousAccess) {
          const reading = requested
          const { data } = await readApi<T>(url, { method: identity === undefined ? 'GET' : 'POST', ...(identity === undefined ? {} : { body: identity }) }, abort.signal)
          if (abort.signal.aborted) return
          if (requested === reading) setResource({ state: 'ready', data })
          completed = reading
          if (previous !== undefined && previous !== presence.revision) window.dispatchEvent(new Event('records-live-changed'))
        }
        previous = presence.revision; previousAccess = presence.accessRevision; setNotice('Live updates on')
      } catch (error) { if (!abort.signal.aborted) failed(error) }
      finally {
        running = false
        if (!paused && !abort.signal.aborted && document.visibilityState === 'visible' && navigator.onLine) timer = setTimeout(tick, Math.max(0, 750 - (Date.now() - started)))
      }
    }
    function changed() { requested++; paused = false; if (timer) clearTimeout(timer); void tick() }
    function resume() {
      if (timer) clearTimeout(timer)
      if (document.visibilityState === 'visible' && navigator.onLine) { requested++; void tick() }
      else { setParticipants([]); setNotice(navigator.onLine ? 'Live updates paused while this tab is hidden.' : 'Offline. Live updates paused.') }
    }
    window.addEventListener('records-changed', changed)
    requestRefresh.current = changed
    window.addEventListener('online', resume); window.addEventListener('offline', resume)
    document.addEventListener('visibilitychange', resume)
    void tick()
    return () => { requestRefresh.current = () => {}; abort.abort(); if (timer) clearTimeout(timer); window.removeEventListener('records-changed', changed); window.removeEventListener('online', resume); window.removeEventListener('offline', resume); document.removeEventListener('visibilitychange', resume) }
  }, [url, identity, presenceUrl])
  // Invalidation keeps editors and related readers mounted, including during an active read.
  useEffect(refresh, [refresh, refreshKey])
  const resource: Resource<T> = loaded.key === key ? loaded.resource : { state: 'loading', data: null }
  return { resource, refresh, reload, participants: loaded.key === key ? participants : [], notice: loaded.key === key ? notice : 'Connecting to live updates…' }
}

export function LiveRecordsStatus({ participants, notice }: { participants: Presence['participants']; notice: string }) {
  const session = useDocumentSession(), others = participants.filter(person => person.id !== session?.operator.id)
  return <>{others.slice(0, 1).map(person => <Tooltip key={person.id} label={`Viewing: ${person.name}`}><span className="cr-presence-avatar" tabIndex={0} aria-label={`Viewing: ${person.name}`}>{person.name.slice(0, 1)}{others.length > 1 && <span className="cr-presence-avatar__count">+{others.length - 1}</span>}</span></Tooltip>)}{notice !== 'Live updates on' && notice !== 'Connecting to live updates…' && <span role="status">{notice}</span>}</>
}
