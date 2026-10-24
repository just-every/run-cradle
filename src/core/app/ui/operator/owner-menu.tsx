import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { SessionFailure, sessionFetch } from '../../../../ui/shared/session-fetch'

type Owner = { name: string; initials: string; workspaceName: string }

/** The owner block at the foot of the menu: a button that opens a small menu holding Sign out. */
export function OwnerMenu({ owner }: { owner: Owner }) {
  const [open, setOpen] = useState(false), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false)
  const button = useRef<HTMLButtonElement>(null), item = useRef<HTMLButtonElement>(null)
  const menu = useId()
  useEffect(() => { if (open) item.current?.focus() }, [open])
  const close = () => { setOpen(false); setFailed(false); button.current?.focus() }
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); item.current?.focus() }
    else if (event.key === 'Tab') setOpen(false)
  }
  // In flight, Sign out keeps focus and ignores presses (aria-disabled: `disabled` would blur it and close the menu).
  // A sign-out that does not finish keeps the menu open with the alert and focus on Sign out, where Enter tries again.
  // A 401, from the CSRF read or the sign-out itself, means the session already ended (signed out in another tab,
  // revoked or expired): the owner is signed out, so it lands on / as a sign-out that worked does.
  async function signOut() {
    if (busy) return
    setBusy(true); setFailed(false)
    const signedOut = await sessionFetch('/auth/sign-out', { method: 'POST' })
      .then(response => response.ok || response.status === 401, (error: unknown) => error instanceof SessionFailure && error.status === 401)
    if (signedOut) { window.location.assign('/'); return }
    setBusy(false); setFailed(true); setOpen(true); item.current?.focus()
  }
  return <div className="operator-rail-footer" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setFailed(false) } }}>
    {open && <div className="operator-owner-menu">
      <div id={menu} role="menu" aria-label="Account" onKeyDown={keys}>
        <button ref={item} type="button" role="menuitem" aria-disabled={busy || undefined} onClick={() => void signOut()}>Sign out</button>
      </div>
      {failed && <p role="alert">Sign out did not finish. Try again.</p>}
    </div>}
    <button ref={button} type="button" className="operator-owner-button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menu : undefined}
      onClick={() => open ? close() : setOpen(true)}
      onKeyDown={event => { if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true) } else if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
      <span className="operator-avatar" aria-hidden="true">{owner.initials}</span>
      <span className="operator-account-copy"><strong>{owner.name}</strong><small>{owner.workspaceName}</small></span>
    </button>
  </div>
}
