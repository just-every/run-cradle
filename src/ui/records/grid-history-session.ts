import { useEffect, useState, type SetStateAction } from 'react'
import { useDocumentSession } from '../../core/app/document-context'
import type { CellValue, RevisionRef } from '../../contracts/primitives'
import type { EntitySchema } from '../../domains/records/contracts'
export type HistoryChange = { recordId: string; changes: Record<string, CellValue>; ifValues?: Record<string, CellValue>; unchangedSince?: number }
export type HistoryEntry = { rows: HistoryChange[]; expected: RevisionRef[] }
type Stacks = { undo: HistoryEntry[]; redo: HistoryEntry[] }
type Stored = Stacks & { key: string | null; error: string }
const empty = (): Stacks => ({ undo: [], redo: [] })

/** Tab-scoped history belongs to the admitted operator and the exact table schema. */
export function useTableHistorySession(schema: EntitySchema) {
  const session = useDocumentSession()
  const key = session ? `cradle-history:${session.operator.id}:${schema.appId}:${schema.id}:${schema.version}` : null
  const [state, setState] = useState<Stored>({ key: null, ...empty(), error: '' })
  useEffect(() => {
    if (!key) return
    try {
      const saved = sessionStorage.getItem(key), stacks: Stacks = saved ? JSON.parse(saved) : empty()
      if (!Array.isArray(stacks.undo) || !Array.isArray(stacks.redo) || [...stacks.undo, ...stacks.redo].some(entry => !Array.isArray(entry.rows) || !Array.isArray(entry.expected))) throw Error('Invalid edit history')
      setState({ key, undo: stacks.undo.slice(-50), redo: stacks.redo.slice(-50), error: '' })
    } catch { setState({ key, ...empty(), error: 'Saved undo history could not be read. Clear it before editing.' }) }
  }, [key])
  useEffect(() => {
    if (!key || state.key !== key || state.error) return
    try { sessionStorage.setItem(key, JSON.stringify({ undo: state.undo, redo: state.redo })) }
    catch { setState(current => ({ ...current, error: 'Undo history could not be saved. Enable browser session storage before editing.' })) }
  }, [key, state])
  useEffect(() => {
    const revoked = () => { try {if (key) sessionStorage.removeItem(key);setState({ key, ...empty(), error: '' })}catch{setState({key,...empty(),error:'Saved undo history could not be cleared. Close this tab before switching accounts.'})} }
    document.addEventListener('cradle:session-revoked', revoked)
    return () => document.removeEventListener('cradle:session-revoked', revoked)
  }, [key])
  return {
    undo: state.key === key ? state.undo : [], redo: state.key === key ? state.redo : [], error: state.error,
    ready: !!key && state.key === key && !state.error,
    update: (next: SetStateAction<Stacks>) => setState(current => ({ ...current, ...(typeof next === 'function' ? next(current) : next) })),
    clear: () => setState({ key, ...empty(), error: '' }),
  }
}
