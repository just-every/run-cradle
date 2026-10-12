import type { ReactNode } from 'react'
import { openingVars } from './opening'
import { stillMarks, type Mark } from './rows'

const linkPath = 'M156 3l6-6m1-1a2.6 2.6 0 0 1 3.4 3.4m-9.4 3.2a2.6 2.6 0 0 1-3.4-3.4'

/** The row's own link mark, beneath the chip a linked client brings. */
export const RowLink = () => <path d={linkPath} stroke="#7b9a8a" strokeWidth="1.6" strokeLinecap="round" fill="none" />

/** What a card can add to a row: a due date, a done status, a linked client, each drawn about the row's centre. */
const shapes: Record<Mark, ReactNode> = {
  date: <>
    <rect x="232" y="-5.5" width="34" height="11" rx="5.5" fill="#e3edc6" />
    <circle cx="239" cy="0" r="2" fill="#4d7a5e" />
    <path d="M245 0h15" stroke="#7d9a7c" strokeWidth="3" strokeLinecap="round" />
  </>,
  done: <>
    <path d="M80 0h26" stroke="#9fcf94" strokeWidth="9.6" strokeLinecap="round" />
    <path d="m88.6 0.2 2.6 2.4 4.6-4.8" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  link: <>
    <rect x="148" y="-6.5" width="40" height="13" rx="6.5" fill="#d9e8d3" />
    <path d={linkPath} stroke="#2d5a4a" strokeWidth="1.7" strokeLinecap="round" fill="none" />
    <path d="M172 0h10" stroke="#5e7d6c" strokeWidth="3" strokeLinecap="round" />
  </>,
}

/** What cards may add to a row while motion is live, each invisible until its moment (the motion layer owns its opacity and transform). */
export function Arrivals({ done }: { done: boolean }) {
  return <>
    <g data-row-date="" className="lp-arrive" opacity="0">{shapes.date}</g>
    {done ? <g data-row-done="" className="lp-arrive" opacity="0">{shapes.done}</g> : null}
    <g data-row-link="" className="lp-arrive" opacity="0">{shapes.link}</g>
  </>
}

/** What a row of the still carries (rows.ts `stillMarks`), in the server's markup. With motion reduced they stand in the still from the first paint; while motion is allowed hero.css holds them invisible (`data-opening`), so the screen still opens sparse, and once motion is live the Arrivals replace them. */
export function StillMarks({ ring }: { ring: number }) {
  return <>{(stillMarks[ring] ?? []).map((mark) => <g key={mark} data-opening="" style={openingVars({ opacity: 0 })}>{shapes[mark]}</g>)}</>
}
