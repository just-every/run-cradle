import { useEffect } from 'react'
import { useGridHistory } from './grid-history'

/** Mounted outside the query result so an empty or refreshing board can still undo a move. */
export function BoardHistoryToolbar() {
  const history = useGridHistory()
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input,textarea,[contenteditable="true"],[role="textbox"]')) return
      event.preventDefault()
      event.shiftKey ? history.redo() : history.undo()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [history])
  return <div className="cr-board-history">
    <div className="cr-actions" role="group" aria-label="Board editing">
      <button type="button" className="cr-button cr-button--quiet" disabled={!history.canUndo} onClick={history.undo}>Undo</button>
      <button type="button" className="cr-button cr-button--quiet" disabled={!history.canRedo} onClick={history.redo}>Redo</button>
      <span className="cr-muted">Cmd/Ctrl + Z to undo · Shift + Cmd/Ctrl + Z to redo</span>
    </div>
    {history.feedback}
  </div>
}
