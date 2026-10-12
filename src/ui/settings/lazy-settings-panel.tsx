import { useState, type ReactNode } from 'react'

/** Read a panel on first opening, then retain its controls and drafts when collapsed. */
export function LazySettingsPanel({ title, children }: { title: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  return <details className="cr-detail" onToggle={event => {
    if (event.currentTarget.open) setMounted(true)
  }}><summary>{title}</summary>{mounted && children}</details>
}
