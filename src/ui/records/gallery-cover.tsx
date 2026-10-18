import { useEffect, useState } from 'react'
import type { RecordRow } from '../../domains/records/contracts'
import type { FileObject } from '../../domains/evidence/contracts'
import { readApi } from '../shared/api'
import { sessionFetch } from '../shared/session-fetch'

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** Covers belong to the current projected page, never to a retained file cache. */
export function GalleryCover({ record, fieldId, fit = 'cover' }: {
  record: RecordRow; fieldId: string; fit?: 'cover' | 'contain'
}) {
  const cell = record.fields[fieldId]
  const signature = `${record.id}:${record.version}:${JSON.stringify(cell)}`
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState<{ signature: string; fieldId: string; url: string; filename: string } | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    let objectUrl: string | null = null
    function clear() {
      abort.abort()
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null }
      setLoaded(null)
    }
    setLoaded(null); setError(false)
    async function load() {
      if (cell?.state !== 'value' || !Array.isArray(cell.value)) return
      for (const item of cell.value) {
        if (!item || typeof item !== 'object' || !('fileId' in item) || typeof item.fileId !== 'string') continue
        const path = `/api/v1/files/${encodeURIComponent(item.fileId)}`
        const { data } = await readApi<FileObject>(path, { cache: 'no-store' }, abort.signal)
        if (abort.signal.aborted) return
        if (data.state !== 'available' || !imageTypes.has(data.mediaType)) continue
        const response = await sessionFetch(`${path}/content`, { signal: abort.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('Gallery image is unavailable.')
        const mediaType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
        if (!mediaType || !imageTypes.has(mediaType) || mediaType !== data.mediaType) throw new Error('Gallery image type changed.')
        const blob = await response.blob()
        if (abort.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setLoaded({ signature, fieldId, url: objectUrl, filename: data.filename })
        return
      }
    }
    void load().catch(() => { if (!abort.signal.aborted) { setLoaded(null); setError(true) } })
    document.addEventListener('cradle:session-revoked', clear)
    return () => {
      abort.abort()
      document.removeEventListener('cradle:session-revoked', clear)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [signature, fieldId])
  if (cell?.state !== 'value') return null
  if (error) return <p role="status" className="cr-muted">Cover unavailable</p>
  if (!loaded || loaded.signature !== signature || loaded.fieldId !== fieldId) return null
  return <img className="cr-gallery-cover" src={loaded.url} alt={loaded.filename} style={{ objectFit: fit }} loading="lazy" onError={() => setLoaded(null)} />
}
