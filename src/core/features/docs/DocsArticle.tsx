import { useEffect, useRef } from 'react'
import { DocsTocCompact } from './DocsToc'
import type { DocsPageData } from './types'
import { HydrationUnit } from '../../../base/hydration/unit'

/** Copies a code block's text; the button says so for a moment. */
async function copyCode(button: HTMLButtonElement) {
  const code = button.closest('.docs-code-block')?.querySelector('pre')
  if (!code) return
  try { await navigator.clipboard.writeText(code.textContent ?? '') } catch { button.textContent = 'Press Ctrl+C'; return }
  button.textContent = 'Copied'
  setTimeout(() => { button.textContent = 'Copy' }, 1600)
}

/** The page's title and its body, rendered from Markdown at build time. Each code block's Copy button appears once the page is live. */
export function DocsArticle({ page, section }: { page: DocsPageData; section: string }) {
  const prose = useRef<HTMLDivElement>(null)
  useEffect(() => { for (const button of prose.current?.querySelectorAll<HTMLButtonElement>('.docs-copy') ?? []) button.hidden = false }, [page.html])
  return <>
    <HydrationUnit><header className="docs-page-head">
      <p className="docs-eyebrow">{section}</p>
      <h1 id={page.titleId} className="docs-title">{page.title}</h1>
      <svg className="docs-strand" viewBox="0 0 120 22" aria-hidden="true" focusable="false"><path d="M3 15 C34 3 62 21 117 8" /><path d="M3 18 C40 12 70 22 117 14" /></svg>
    </header></HydrationUnit>
    <DocsTocCompact toc={page.toc} />
    <div ref={prose} className="docs-prose" onClick={event => { const button = (event.target as HTMLElement).closest('button.docs-copy'); if (button) void copyCode(button as HTMLButtonElement) }} dangerouslySetInnerHTML={{ __html: page.html }} />
  </>
}
