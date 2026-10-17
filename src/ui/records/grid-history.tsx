import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { CellValue, RevisionRef } from '../../contracts/primitives'
import type { EntitySchema, RecordRow } from '../../domains/records/contracts'
import { useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'

type Change = { recordId: string; changes: Record<string, CellValue> }
type Entry = { rows: Change[]; expected: RevisionRef[] }
type Result = { rows: RecordRow[]; inverse: Change[] }
type History = { clearFeedback(): void; busy: boolean; execute(rows: Change[], records: RecordRow[]): Promise<boolean>; undo(): void; redo(): void; canUndo: boolean; canRedo: boolean; feedback: ReactNode }
const Context = createContext<History | null>(null)

export function GridHistoryProvider({ schema, children }: { schema: EntitySchema; children: ReactNode }) {
  const command = useCommand<Result>(`grid:${schema.appId}:${schema.id}`)
  const [undo, setUndo] = useState<Entry[]>([]), [redo, setRedo] = useState<Entry[]>([])
  const pending = useRef<{ kind: 'edit' | 'undo' | 'redo' } | null>(null)
  const handled = useRef('')
  const busy = !['idle', 'failed', 'committed', 'cancelled'].includes(command.result.state)
  useEffect(() => {
    if (command.result.state !== 'committed' || command.result.commandId === handled.current) return
    handled.current = command.result.commandId
    const { rows, inverse } = command.result.value
    const entry = { rows: inverse, expected: rows.filter(row => inverse.some(item => item.recordId === row.id)).map(row => ({ ref: row.ref, version: row.version })) }
    const rebase = (stack: Entry[]) => stack.map(item => ({ ...item, expected: item.expected.map(expected => { const current = rows.find(row => row.id === expected.ref.recordId); return current ? { ref: current.ref, version: current.version } : expected }) }))
    const kind = pending.current?.kind
    if (kind === 'undo') { setUndo(stack => rebase(stack.slice(0, -1))); setRedo(stack => [...rebase(stack), entry].slice(-50)) }
    else if (kind === 'redo') { setRedo(stack => rebase(stack.slice(0, -1))); setUndo(stack => [...rebase(stack), entry].slice(-50)) }
    else if (inverse.length) { setUndo(stack => [...rebase(stack), entry].slice(-50)); setRedo([]) }
    pending.current = null
    window.dispatchEvent(new Event('records-changed'))
  }, [command.result])
  async function send(entry: Entry, kind: 'edit' | 'undo' | 'redo') {
    if (busy || !entry.rows.length) return false
    pending.current = { kind }
    const result = await command.submit('/api/v1/commands/record.patch', { appId: schema.appId, entityId: schema.id, rows: entry.rows }, entry.expected)
    return !!result
  }
  const history: History = { clearFeedback: command.reset, busy, canUndo: !!undo.length && !busy, canRedo: !!redo.length && !busy,
    execute: (rows, records) => send({ rows, expected: records.filter(row => rows.some(item => item.recordId === row.id)).map(row => ({ ref: row.ref, version: row.version })) }, 'edit'),
    undo: () => { if (undo.length) void send(undo.at(-1)!, 'undo') }, redo: () => { if (redo.length) void send(redo.at(-1)!, 'redo') },
    feedback: <><CommandFeedback {...command} />{command.result.state === 'failed' && command.result.error.detail.issues && <ul className="cr-notice" role="alert">{command.result.error.detail.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}</> }
  return <Context.Provider value={history}>{children}</Context.Provider>
}
export function useGridHistory() { const value = useContext(Context); if (!value) throw Error('Grid history needs a table.'); return value }
