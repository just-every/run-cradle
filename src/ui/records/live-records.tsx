import { useCallback, useEffect, useRef, useState } from 'react'
import { readApi, RequestFailure, type Resource } from '../shared/api'

type Presence = { participants: { id: string; name: string }[]; revision: number }

/** A heartbeat rechecks authority every second. Only committed changes refresh the query. */
export function useLiveRecords<T>(url: string, input: unknown, presenceUrl: string | null, restart: () => void, refreshKey = 0) {
  const identity = JSON.stringify(input)
  const key = JSON.stringify([url, identity, presenceUrl])
  const [loaded, setLoaded] = useState<{ key: string; resource: Resource<T> }>({ key, resource: { state: 'loading', data: null } })
  const setResource = (resource: Resource<T>) => setLoaded({ key, resource })
  const [participants, setParticipants] = useState<Presence['participants']>([])
  const [notice, setNotice] = useState('Connecting to live updates…')
  const [revision, setRevision] = useState(0)
  const restartRef = useRef(restart); restartRef.current = restart
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined, running = false, paused = false, previous: number | undefined, needsRead = true
    setResource({ state: 'loading', data: null }); setParticipants([])
    if (!presenceUrl) return
    const heartbeatUrl = presenceUrl
    function failed(error: unknown) {
      const problem = error instanceof RequestFailure ? error : new RequestFailure(0, { requestId: '', operation: 'Live records', code: 'internal', message: error instanceof Error ? error.message : 'Could not refresh records.', retry: 'read' })
      setResource({ state: problem.status === 401 ? 'signed_out' : problem.status === 403 ? 'forbidden' : problem.status === 404 ? 'not_found' : 'failed', data: null, error: problem })
      setParticipants([]); setNotice('Live updates unavailable.'); needsRead = true
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
        if (needsRead || presence.revision !== previous) {
          const { data } = await readApi<T>(url, { method: identity === undefined ? 'GET' : 'POST', ...(identity === undefined ? {} : { body: identity }) }, abort.signal)
          if (abort.signal.aborted) return
          setResource({ state: 'ready', data }); needsRead = false
          if (previous !== undefined && previous !== presence.revision) window.dispatchEvent(new Event('records-live-changed'))
        }
        previous = presence.revision; setNotice('Live updates on')
      } catch (error) { if (!abort.signal.aborted) failed(error) }
      finally {
        running = false
        if (!paused && !abort.signal.aborted && document.visibilityState === 'visible' && navigator.onLine) timer = setTimeout(tick, Math.max(0, 1000 - (Date.now() - started)))
      }
    }
    function changed() { needsRead = true; if (timer) clearTimeout(timer); void tick() }
    function resume() {
      if (timer) clearTimeout(timer)
      if (document.visibilityState === 'visible' && navigator.onLine) { needsRead = true; void tick() }
      else { setParticipants([]); setNotice(navigator.onLine ? 'Live updates paused while this tab is hidden.' : 'Offline. Live updates paused.') }
    }
    window.addEventListener('records-changed', changed)
    window.addEventListener('online', resume); window.addEventListener('offline', resume)
    document.addEventListener('visibilitychange', resume)
    void tick()
    return () => { abort.abort(); if (timer) clearTimeout(timer); window.removeEventListener('records-changed', changed); window.removeEventListener('online', resume); window.removeEventListener('offline', resume); document.removeEventListener('visibilitychange', resume) }
  }, [url, identity, presenceUrl, revision, refreshKey])
  const resource: Resource<T> = loaded.key === key ? loaded.resource : { state: 'loading', data: null }
  return { resource, refresh, participants: loaded.key === key ? participants : [], notice: loaded.key === key ? notice : 'Connecting to live updates…' }
}

export function LiveRecordsStatus({ participants, notice }: { participants: Presence['participants']; notice: string }) {
  return <div className="cr-live-records"><span>{notice}</span>{participants.length > 0 && <span aria-label="People viewing">Viewing: {participants.map(person => person.name).join(', ')}</span>}</div>
}
