import { createContext, useContext, useEffect, useRef, useState, type ChangeEvent, type ComponentProps } from 'react'

const BusyColumnContext = createContext(false)

export function ImportColumnFieldset({ busy, children, ...props }: ComponentProps<'fieldset'> & { busy: boolean }) {
  return <BusyColumnContext value={busy}><fieldset {...props} aria-disabled={busy || props.disabled || undefined}
    onKeyDownCapture={event => { if (busy && !['Tab', 'Escape'].includes(event.key)) event.preventDefault() }}
    onPointerDownCapture={event => { if (busy) event.preventDefault() }}
    onClickCapture={event => { if (busy) { event.preventDefault(); event.stopPropagation() } }}
    onBeforeInputCapture={event => { if (busy) event.preventDefault() }}
    onPasteCapture={event => { if (busy) event.preventDefault() }}
    onDropCapture={event => { if (busy) event.preventDefault() }}
    onChangeCapture={event => { if (busy) event.stopPropagation() }}
    onBlurCapture={event => { if (busy) event.stopPropagation() }}
  >{children}</fieldset></BusyColumnContext>
}

// The server still owns the accepted preview. Keep the user's pending native
// selection visible, and its control focused, while that preview recomputes.
export function ImportColumnSelect({ value, onChange, onBlur, onKeyDown, ...props }: ComponentProps<'select'>) {
  const busy = useContext(BusyColumnContext)
  const [draft, setDraft] = useState(value)
  const keyboardSelection = useRef(false)
  const pendingChange = useRef<ChangeEvent<HTMLSelectElement> | null>(null)
  useEffect(() => { if (!busy) setDraft(value) }, [value, busy])
  function commitSelection() {
    const event = pendingChange.current
    pendingChange.current = null
    keyboardSelection.current = false
    if (event && !busy) onChange?.(event)
  }
  return <select {...props} value={draft} aria-disabled={busy || props.disabled || undefined}
    onKeyDown={event => {
      // Native type-ahead can change several options while the user is still
      // spelling a label. Commit keyboard choices on Enter or when Tab leaves.
      if (event.key === 'Enter' && pendingChange.current) { event.preventDefault(); commitSelection() }
      else if (event.key.length === 1 || ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) keyboardSelection.current = true
      onKeyDown?.(event)
    }}
    onChange={event => {
      if (busy) return
      setDraft(event.currentTarget.value)
      if (keyboardSelection.current) pendingChange.current = event
      else onChange?.(event)
    }}
    onBlur={event => { commitSelection(); onBlur?.(event) }}
  />
}

export function ImportColumnTextarea(props: ComponentProps<'textarea'>) {
  const busy = useContext(BusyColumnContext)
  return <textarea {...props} disabled={busy || props.disabled} />
}
