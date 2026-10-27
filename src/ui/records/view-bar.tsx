import { useRef, useState } from 'react'
import { ViewSheet } from './view-sheet'
import './view-bar.css'

export type ViewPill = { label: string; href: string; current: boolean; group: string }
/** Wave two can replace the list with template views without changing its presentation. */
export function ViewBar({ pills, currentLabel, onSelect }: { pills: ViewPill[]; currentLabel?: string; onSelect?(pill: ViewPill): void }) {
  const [open, setOpen] = useState(false), anchor = useRef<HTMLButtonElement>(null)
  const current = pills.find(pill => pill.current && pill.group === 'saved') ?? pills.find(pill => pill.current && pill.group === 'displays' && pill.label !== 'Grid') ?? pills.find(pill => pill.current && pill.group === 'tables') ?? pills.find(pill => pill.current)
  const links = pills.map((pill, index) => <a key={`${pill.group}:${pill.href}:${index}`} href={pill.href} className={`cr-tab${index && pills[index - 1]?.group !== pill.group ? ' cr-view-bar__divider' : ''}`} aria-current={pill.current ? 'page' : undefined} onClick={event => { if (onSelect && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) { event.preventDefault(); onSelect(pill); setOpen(false) } }}>{pill.label}</a>)
  return <div className="cr-view-bar">
    <nav className="cr-tabs cr-view-bar__pills" aria-label="Record views">{links}</nav>
    <button className="cr-button cr-button--quiet cr-view-bar__opener" ref={anchor} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{currentLabel ?? current?.label ?? 'Views'} ▾</button>
    <ViewSheet title="Views" open={open} onClose={() => setOpen(false)} anchor={anchor}>{links}</ViewSheet>
  </div>
}
