import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import type { EntitySchema, RecordRow } from '../../domains/records/contracts'
import { useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'
import { useTableHistorySession, type HistoryChange, type HistoryEntry } from './grid-history-session'
export type HistoryResult = { rows: RecordRow[]; inverse: HistoryChange[] }
type History = { clearFeedback(): void; accept(result: HistoryResult): void; busy: boolean; execute(rows: HistoryChange[], records: RecordRow[]): Promise<boolean>; undo(): void; redo(): void; canUndo: boolean; canRedo: boolean; feedback: ReactNode }
const Context = createContext<History | null>(null)

export function GridHistoryProvider({ schema, children }: { schema: EntitySchema; children: ReactNode }) {
  const command = useCommand<HistoryResult>(`grid:${schema.appId}:${schema.id}`)
  const store = useTableHistorySession(schema)
  const pending = useRef<'edit' | 'undo' | 'redo'>('edit'), handled = useRef('')
  const busy = !store.ready || !['idle', 'failed', 'committed', 'cancelled'].includes(command.result.state)
  function accept(result: HistoryResult, kind: 'edit' | 'undo' | 'redo' = 'edit') {
    const entry: HistoryEntry = {
      rows: result.inverse.map(change => {
        const row = result.rows.find(row => row.id === change.recordId)!
        return { ...change, unchangedSince: row.version, ifValues: Object.fromEntries(Object.keys(change.changes).map(id => {
          const cell = row.fields[id]
          if (cell?.state !== 'value') throw Error('Undo requires readable changed cells.')
          return [id, cell.value]
        })) }
      }),
      expected: result.rows.filter(row => result.inverse.some(item => item.recordId === row.id)).map(row => ({ ref: row.ref, version: row.version })),
    }
    const rebase = (stack: HistoryEntry[]) => stack.map(item => ({ ...item, expected: item.expected.map(expected => { const current = result.rows.find(row => row.id === expected.ref.recordId); return current ? { ref: current.ref, version: current.version } : expected }) }))
    store.update(stacks => kind === 'undo' ? { undo: rebase(stacks.undo.slice(0, -1)), redo: [...rebase(stacks.redo), entry].slice(-50) }
      : kind === 'redo' ? { redo: rebase(stacks.redo.slice(0, -1)), undo: [...rebase(stacks.undo), entry].slice(-50) }
      : result.inverse.length ? { undo: [...rebase(stacks.undo), entry].slice(-50), redo: [] } : stacks)
  }
  useEffect(() => {
    if (command.result.state !== 'committed' || command.result.commandId === handled.current) return
    handled.current = command.result.commandId
    accept(command.result.value, pending.current)
    window.dispatchEvent(new Event('records-changed'))
  }, [command.result])
  async function send(entry: HistoryEntry, kind: 'edit' | 'undo' | 'redo') {
    if (busy || !entry.rows.length) return false
    pending.current = kind
    const result = await command.submit('/api/v1/commands/record.patch', { appId: schema.appId, entityId: schema.id, rows: entry.rows }, entry.expected)
    return !!result
  }
  const history: History = { clearFeedback: command.reset, accept, busy, canUndo: !!store.undo.length && !busy, canRedo: !!store.redo.length && !busy,
    execute: (rows, records) => send({ rows, expected: records.filter(row => rows.some(item => item.recordId === row.id)).map(row => ({ ref: row.ref, version: row.version })) }, 'edit'),
    undo: () => { if (store.undo.length) void send(store.undo.at(-1)!, 'undo') }, redo: () => { if (store.redo.length) void send(store.redo.at(-1)!, 'redo') },
    feedback: <><CommandFeedback {...command} />{store.error && <div className="cr-notice" role="alert"><p>{store.error}</p><button type="button" className="cr-button cr-button--quiet" onClick={store.clear}>Clear undo history</button></div>}{command.result.state === 'failed' && command.result.error.detail.issues && <div className="cr-notice" role="alert"><ul>{command.result.error.detail.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></div>}</> }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,[contenteditable="true"],[role="textbox"]')) return
      event.preventDefault(); event.shiftKey ? history.redo() : history.undo()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [history])
  return <Context.Provider value={history}>{children}</Context.Provider>
}
export function useGridHistory() { const value = useContext(Context); if (!value) throw Error('Grid history needs a table.'); return value }
export function useOptionalGridHistory() { return useContext(Context) }
