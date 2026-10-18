import { useGridHistory } from './grid-history'

/** Mounted outside the query result so an empty or refreshing board can still undo a move. */
export function BoardHistoryToolbar({ label = 'Board editing' }: { label?: string }) {
  const history = useGridHistory()
  return <div className="cr-board-history">
    <div className="cr-actions" role="group" aria-label={label}>
      <button type="button" className="cr-button cr-button--quiet" disabled={!history.canUndo} onClick={history.undo}>Undo</button>
      <button type="button" className="cr-button cr-button--quiet" disabled={!history.canRedo} onClick={history.redo}>Redo</button>
      <span className="cr-muted">Cmd/Ctrl + Z to undo · Shift + Cmd/Ctrl + Z to redo</span>
    </div>
    {history.feedback}
  </div>
}
