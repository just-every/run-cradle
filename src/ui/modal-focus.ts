/** Keep sequential keyboard focus on visible actions in an open modal. */
export function cycleModalFocus(event: KeyboardEvent, drawer: HTMLDialogElement | null) {
  if (event.key !== 'Tab' || !drawer?.open) return
  const actions = [...drawer.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]')].filter(element => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return element.tabIndex >= 0 && !element.matches(':disabled,[aria-disabled="true"]')
      && !element.closest('[hidden],[inert],[aria-hidden="true"]')
      && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
  })
  if (!actions.length) return
  const active = document.activeElement
  const boundary = event.shiftKey ? actions[0] : actions.at(-1)
  if (active === boundary || active === drawer || !drawer.contains(active)) {
    event.preventDefault()
    ;(event.shiftKey ? actions.at(-1) : actions[0])?.focus()
  }
}
