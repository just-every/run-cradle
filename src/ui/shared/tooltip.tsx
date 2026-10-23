import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactElement, type ReactNode } from 'react'

const HOVER_DELAY = 300, GAP = 8, EDGE = 8
const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect
type ControlProps = { children?: ReactNode; 'aria-label'?: string; onPointerEnter?: (event: PointerEvent<HTMLElement>) => void; onPointerLeave?: (event: PointerEvent<HTMLElement>) => void; onFocus?: (event: FocusEvent<HTMLElement>) => void; onBlur?: (event: FocusEvent<HTMLElement>) => void }

/** The one tooltip for icon-only controls. Its text is the control's accessible name; it shows 300 ms after a mouse hover
 *  and at once on keyboard focus, Escape hides it, and it sits beside the control without covering it or taking a tap. */
export function Tooltip({ label, children }: { label: string; children: ReactElement<ControlProps> }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const anchor = useRef<HTMLElement | null>(null), tip = useRef<HTMLSpanElement>(null)
  const id = useId()
  const hide = () => { clearTimeout(timer.current); setOpen(false) }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!open) return
    // The first Escape only dismisses the tooltip; the next reaches the page (a drawer, a dialog).
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide() } }
    document.addEventListener('keydown', escape, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => { document.removeEventListener('keydown', escape, true); window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide) }
  }, [open])
  useClientLayoutEffect(() => {
    const element = tip.current, control = anchor.current
    if (!open || !element || !control) return
    const target = control.getBoundingClientRect(), own = element.getBoundingClientRect()
    const left = Math.min(Math.max(EDGE, target.left + target.width / 2 - own.width / 2), innerWidth - EDGE - own.width)
    const top = target.bottom + GAP + own.height <= innerHeight - EDGE ? target.bottom + GAP : target.top - GAP - own.height
    element.style.left = `${left}px`; element.style.top = `${top}px`
    // A transformed ancestor would offset this fixed box; measure once and correct for it.
    const placed = element.getBoundingClientRect()
    element.style.left = `${2 * left - placed.left}px`; element.style.top = `${2 * top - placed.top}px`
  }, [open])
  const props = children.props
  return cloneElement(children, {
    'aria-label': label,
    onPointerEnter: event => { props.onPointerEnter?.(event); anchor.current = event.currentTarget; if (event.pointerType === 'touch') return; clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), HOVER_DELAY) },
    onPointerLeave: event => { props.onPointerLeave?.(event); hide() },
    onFocus: event => { props.onFocus?.(event); anchor.current = event.currentTarget; if (event.currentTarget.matches(':focus-visible')) { clearTimeout(timer.current); setOpen(true) } },
    onBlur: event => { props.onBlur?.(event); hide() },
    children: <>{props.children}{open && <span ref={tip} id={id} role="tooltip" className="cr-tooltip">{label}</span>}</>,
  })
}
