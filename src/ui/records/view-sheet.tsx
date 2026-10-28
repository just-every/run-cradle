import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import './view-bar.css'

/** A native dialog preserves keyboard containment and returns focus to its opener. */
export function ViewSheet({ open, onClose, title, anchor, children, wide = false }: { open: boolean; onClose(): void; title: string; anchor?: RefObject<HTMLElement | null>; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose); close.current = onClose
  useEffect(() => {
    const node = dialog.current
    if (!node || !open) return
    const opener = anchor?.current ?? document.activeElement
    const place = () => {
      if (!anchor?.current) return
      const rect = anchor.current.getBoundingClientRect()
      node.style.setProperty('--sheet-left', `${Math.max(16, Math.min(rect.left, innerWidth - node.offsetWidth - 16))}px`)
      node.style.setProperty('--sheet-top', `${Math.max(16, Math.min(rect.bottom + 8, innerHeight - node.offsetHeight - 16))}px`)
    }
    node.showModal(); place()
    const observer = new ResizeObserver(place); observer.observe(node)
    window.addEventListener('resize', place)
    return () => { observer.disconnect(); window.removeEventListener('resize', place); node.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }) }
  }, [open, anchor])
  return <dialog ref={dialog} className={`cr-view-sheet${wide ? ' cr-view-sheet--wide' : ''}`} aria-label={title} onCancel={event => { event.preventDefault(); close.current() }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close.current() } }}>
    <header className="cr-view-sheet__heading"><h2>{title}</h2><button type="button" className="cr-button cr-button--quiet" onClick={onClose}>Close</button></header>
    <div className="cr-view-sheet__body">{children}</div>
  </dialog>
}
