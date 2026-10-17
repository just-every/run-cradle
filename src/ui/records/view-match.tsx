import { useEffect, useRef, type ReactNode } from 'react'
import type { ViewMatch } from './find-in-view'

/** Keep the search box focused while bringing the selected, rendered cell into view. */
export function ViewMatchCell({ recordId, fieldId, match, children }: { recordId: string; fieldId: string; match?: ViewMatch | null; children: ReactNode }) {
  const target = useRef<HTMLSpanElement>(null)
  const selected = match?.recordId === recordId && match.fieldId === fieldId
  useEffect(() => { if (selected) target.current?.scrollIntoView({ block: 'center', inline: 'center' }) }, [selected, match])
  return <span ref={target} data-record-id={recordId} data-field-id={fieldId} className={selected ? 'cr-view-match' : undefined}>{children}</span>
}
