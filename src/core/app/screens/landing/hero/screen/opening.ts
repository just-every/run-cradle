import type { CSSProperties } from 'react'
import type { State } from './clip'
import { ENTER_X, place, SHOWN } from './rows'

/** The Projects screen as the motion opens: sparse, and filled by the first cards to land. The grid holds only the last two of the still's seven rows, at its top; new rows slide in above them in the ring's order until it holds the still's seven in the still's order. The detail card, the field and the AI brief show only their quiet placeholders until a card brings them in. The status chips belong to the project and are there from the start. With motion reduced the screen is the still's, full from the first paint.
 *
 * These states are both the first frame of the screen's plan (rowsPlan.ts, sidePlan.ts) and, through `openingVars`, what the server's markup shows while motion is allowed (hero.css), so nothing on screen changes as the motion takes over. */
export const OPENING_ROWS = 2

/** The slot a row of the ring holds as the motion opens, or null while it waits out of sight. */
export const openingSlot = (ring: number): number | null => (ring >= SHOWN - OPENING_ROWS && ring < SHOWN ? ring - (SHOWN - OPENING_ROWS) : null)

/** A row as the motion opens: in its slot, or waiting out of sight where new rows slide in from. */
export function openingRow(ring: number): State {
  const slot = openingSlot(ring)
  return slot === null ? { transform: place(0, ENTER_X), opacity: 0 } : { transform: place(slot), opacity: 1 }
}

/** A side card's line not yet written in, and the AI brief not yet arrived (it rises into place when it does). */
export const EMPTY_LINE: State = { transform: 'scaleX(0)' }
export const EMPTY_BRIEF: State = { opacity: 0, transform: 'translateY(14px)' }

/** The custom properties that carry an element's opening state into the markup. The element also carries `data-opening`; hero.css applies them only while motion is allowed. */
export const openingVars = ({ transform = 'none', opacity = 1 }: State): CSSProperties => ({ '--ot': transform, '--oo': opacity }) as CSSProperties
