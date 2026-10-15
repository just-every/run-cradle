import { useState } from 'react'
import { sessionFetch } from '../shared/session-fetch'

/** One-way CSV download of a launch view in its visible order (DATA-002). */
export function ExportLaunchCsv({ params, label = 'Export CSV' }: { params: Record<string, string>; label?: string }) {
 const [busy, setBusy] = useState(false), [error, setError] = useState('')
 async function download() {
  setBusy(true); setError('')
  try {
   const response = await sessionFetch(`/api/exports/csv?${new URLSearchParams(Object.entries(params).filter(([, value]) => value))}`)
   const body = await response.json().catch(() => null) as { csv?: string; filename?: string; error?: { message?: string } } | null
   if (!response.ok || typeof body?.csv !== 'string' || typeof body.filename !== 'string') throw new Error(body?.error?.message ?? 'The export could not be prepared.')
   const url = URL.createObjectURL(new Blob([body.csv], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a')
   link.href = url; link.download = body.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export failed.') } finally { setBusy(false) }
 }
 return <span className="launch-export"><button type="button" className="cr-button cr-button--quiet" disabled={busy} onClick={() => void download()}>{busy ? 'Exporting…' : label}</button>{error && <span role="alert" className="cr-error">{error}</span>}</span>
}
