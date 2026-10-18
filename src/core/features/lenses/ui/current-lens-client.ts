import { useEffect, useRef, useState } from 'react'
import { sessionFetch } from '../../../../ui/shared/session-fetch'
import { useInitialDocumentValue } from '../../../app/document-data'
import type { readSavedLensResults } from '../../../../apps/launch/lens-results.server'

export type CurrentLens = Awaited<ReturnType<typeof readSavedLensResults>>
const decode = (value: unknown): CurrentLens => {
 if (!value || typeof value !== 'object' || !('lens' in value) || !('items' in value) || !Array.isArray(value.items) || !('evaluatedAt' in value)) throw new Error('The lens evaluation returned an invalid response.')
 return value as CurrentLens
}
export function useCurrentLens(id: string) {
 const path = `/api/lenses/${encodeURIComponent(id)}?view=results`
 const initial = useInitialDocumentValue(path, decode)
 const [value, setValue] = useState(initial)
 const [pending, setPending] = useState(false)
 const [error, setError] = useState<string | null>(null)
 const sequence = useRef(0)
 const refresh = async (cursor?: string) => {
  const current = ++sequence.current
  setPending(true); setError(null)
  // Clear the entire previous evaluation together, including its detail.
  setValue(undefined)
  try {
   const response = await sessionFetch(`${path}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, {cache:'no-store'})
   if (!response.ok) throw new Error(response.status === 401 ? 'Your session has ended. Sign in to continue.' : response.status === 404 ? 'This lens is no longer available.' : 'The current lens could not be evaluated. Try refreshing again.')
   const next = decode(await response.json())
   if (sequence.current === current) setValue(next)
  } catch (caught) { if (sequence.current === current) setError(caught instanceof Error ? caught.message : 'The lens request failed.') }
  finally { if (sequence.current === current) setPending(false) }
 }
 useEffect(() => { if (initial === undefined) void refresh(); return () => { sequence.current++ } }, [id])
 return {value, pending, error, refresh}
}
