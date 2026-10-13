import { useEffect, useState } from 'react'
import type { DocsTocEntry } from './types'
import { HydrationUnit } from '../../../base/hydration/unit'

type Group = DocsTocEntry & { children: DocsTocEntry[] }

/** h3 entries nest under the h2 before them. Pages with fewer than two h2s get no contents list. */
function groups(toc: DocsTocEntry[]) {
  if (toc.filter(entry => entry.depth === 2).length < 2) return []
  return toc.reduce<Group[]>((list, entry) => {
    if (entry.depth === 3 && list.length) list[list.length - 1].children.push(entry)
    else list.push({ ...entry, children: [] })
    return list
  }, [])
}

/** The id of the last heading scrolled past the top of the window, or the first heading before any is. */
function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? '')
  useEffect(() => {
    const update = () => {
      const passed = ids.filter(id => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= 120)
      setActive(passed.at(-1) ?? ids[0] ?? '')
    }
    update()
    addEventListener('scroll', update, { passive: true })
    return () => removeEventListener('scroll', update)
  }, [ids.join()])
  return active
}

function TocList({ toc, active }: { toc: DocsTocEntry[]; active?: string }) {
  const mark = (id: string) => id === active ? 'location' : undefined
  return <ul>
    {groups(toc).map(group => <li key={group.id}>
      <a href={`#${group.id}`} aria-current={mark(group.id)}>{group.text}</a>
      {group.children.length > 0 && <ul>{group.children.map(entry => <li key={entry.id}><a href={`#${entry.id}`} aria-current={mark(entry.id)}>{entry.text}</a></li>)}</ul>}
    </li>)}
  </ul>
}

/** The contents list beside the page, from 1200px. */
export function DocsToc({ toc }: { toc: DocsTocEntry[] }) {
  const active = useActiveHeading(toc.map(entry => entry.id))
  if (!groups(toc).length) return null
  return <HydrationUnit><nav className="docs-toc" aria-label="On this page">
    <p className="docs-toc-title">On this page</p>
    <TocList toc={toc} active={active} />
  </nav></HydrationUnit>
}

/** The same list above the page body below 1200px, folded away until asked for. */
export function DocsTocCompact({ toc }: { toc: DocsTocEntry[] }) {
  if (!groups(toc).length) return null
  return <HydrationUnit><details className="docs-toc-compact">
    <summary>On this page</summary>
    <TocList toc={toc} />
  </details></HydrationUnit>
}
