import { openingRow, openingVars } from './opening'
import { ENTER_X, GREEN, rowY, statuses } from './rows'
import { Arrivals, RowLink, StillMarks } from './RowMarks'

const line = { strokeWidth: 4, strokeLinecap: 'round' } as const

/** One row of the grid: status, owner, link and menu marks, drawn about its own centre and placed in its slot of the still. Row `ring` 7 is the one that waits out of sight; it and each row's arrivals and highlight exist only while motion is live, and the still's own marks only until then (RowMarks.tsx). The row also carries where the motion opens it (opening.ts), which hero.css applies while motion is allowed. */
export function GridRow({ ring, live }: { ring: number; live: boolean }) {
  const color = statuses[ring]
  const waiting = ring >= 7
  return <g data-row={ring} data-opening="" style={openingVars(openingRow(ring))} transform={waiting ? `translate(${ENTER_X} ${rowY(0)})` : `translate(0 ${rowY(ring)})`} opacity={waiting ? 0 : undefined}>
    {live ? <rect data-row-hl="" x="1" y="-12" width="318" height="24" fill="#d7f25b" opacity="0" /> : null}
    <rect x="10" y="-5" width="9" height="9" rx="2.5" fill="#e4e8de" />
    <path d="M28 0h10" stroke="#d3dacd" {...line} />
    <path d="M44 0h18" stroke="#a9baae" {...line} />
    <path d="M80 0h26" stroke={color} strokeWidth="9" strokeLinecap="round" />
    <circle cx="131" cy="0" r="7" fill="#efe8d5" />
    <circle cx="131" cy="-1.5" r="2.2" fill="#2d5a4a" />
    <path d="M126.6 4a4.4 4 0 0 1 8.8 0z" fill="#2d5a4a" />
    <RowLink />
    <path d="M172 0h8" stroke="#d3dacd" {...line} />
    <path d="M198 0h28" stroke="#c4cfc6" {...line} />
    <g fill="#6f8579"><circle cx="276" cy="0" r="1.5" /><circle cx="282" cy="0" r="1.5" /><circle cx="288" cy="0" r="1.5" /></g>
    {live ? <Arrivals done={color !== GREEN} /> : <StillMarks ring={ring} />}
  </g>
}
