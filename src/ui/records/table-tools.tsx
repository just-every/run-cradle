import { createContext, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Tooltip } from '../shared/tooltip'
import { useGridHistory } from './grid-history'
import { ViewSheet } from './view-sheet'
import './table-tools.css'

type GridTools = { widths: Record<string, number>; setWidth(id: string, width: number): void; resetWidths(): void; frozen: boolean; toggleFrozen(): void; canFill: boolean; setCanFill(value: boolean): void; fill: MutableRefObject<(() => void) | null> }
const GridToolsContext = createContext<GridTools | null>(null)
export function TableToolsProvider({ children }: { children: ReactNode }) {
  const [widths, setWidths] = useState<Record<string, number>>({}), [frozen, setFrozen] = useState(true), [canFill, setCanFill] = useState(false)
  const fill = useRef<(() => void) | null>(null)
  return <GridToolsContext.Provider value={{ widths, setWidth: (id, width) => setWidths(current => ({ ...current, [id]: width })), resetWidths: () => setWidths({}), frozen, toggleFrozen: () => setFrozen(value => !value), canFill, setCanFill, fill }}>{children}</GridToolsContext.Provider>
}
export function useTableGridTools() { return useContext(GridToolsContext) }
export type TableToolPanel = 'columns' | 'shortcuts' | 'summary' | null
export function TableTools({ exports, onImport, onGallery, onForms, onFind, onPanel, onSave }: { exports: ReactNode; onImport(): void; onGallery?: () => void; onForms(): void; onFind(): void; onPanel(panel: TableToolPanel): void; onSave(): void }) {
  const [open, setOpen] = useState(false), anchor = useRef<HTMLButtonElement>(null), history = useGridHistory(), grid = useTableGridTools()
  const [phone, setPhone] = useState(false)
  useEffect(() => { const media = matchMedia('(max-width: 600px)'), update = () => setPhone(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update) }, [])
  const action = (run: () => void) => () => { setOpen(false); run() }
  return <>
    <Tooltip label="Table tools"><button ref={anchor} type="button" className="cr-chip cr-table-tools__trigger" aria-label="Table tools" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>⋯</button></Tooltip>
    <ViewSheet title="Table tools" open={open} onClose={() => setOpen(false)} anchor={anchor}>
      {exports}
      <button type="button" onClick={action(onImport)}>Import CSV</button>
      {onGallery && <><h3>Display</h3><button type="button" onClick={action(onGallery)}>Gallery</button></>}
      <button type="button" onClick={action(onForms)}>Forms</button>
      <button type="button" onClick={action(onFind)}>Find</button>
      <button type="button" onClick={action(() => onPanel('summary'))}>Summary</button>
      <button type="button" onClick={action(() => onPanel('columns'))}>Visible columns</button>
      <button type="button" onClick={action(onSave)}>Save view</button>
      <button type="button" disabled={!history.canUndo} onClick={action(history.undo)}>Undo</button>
      <button type="button" disabled={!history.canRedo} onClick={action(history.redo)}>Redo</button>
      <button type="button" disabled={!grid?.canFill || history.busy} onClick={action(() => grid?.fill.current?.())}>Fill down</button>
      <button type="button" disabled={phone} aria-pressed={phone || (grid?.frozen ?? true)} onClick={() => grid?.toggleFrozen()}>Freeze first column</button>
      <button type="button" onClick={action(() => grid?.resetWidths())}>Reset column widths</button>
      <button type="button" onClick={action(() => onPanel('shortcuts'))}>Keyboard shortcuts</button>
    </ViewSheet>
  </>
}
export function QuietUndo() {
  const history = useGridHistory()
  return <>{history.feedback}{history.canUndo ? <div className="cr-quiet-undo" role="group" aria-label="Recent edit"><button type="button" className="cr-button cr-button--quiet" onClick={history.undo}>Undo</button></div> : null}</>
}
