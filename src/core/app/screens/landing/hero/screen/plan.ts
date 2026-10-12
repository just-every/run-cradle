import type { CardKind } from '../cards/bodies'
import type { Scene } from '../cards/layout'
import { visitsOf } from '../cards/visits'
import { ABSORB, LAND, PERIOD } from '../schedule'
import { planRows, type RowAction, type RowClips } from './rowsPlan'
import { planSide, type SideAction, type SideClips } from './sidePlan'

/** What each kind of card brings into the Projects screen as it lands. Records arrive as new rows (a spreadsheet or CSV brings a few at once); a calendar fills in due dates; a checklist turns statuses to done; a link chip links a row to its client; notes and documents fill in a detail field; an automation lights its chip; an AI brief brings a new brief into the side panel. */
const brings: Record<CardKind, Omit<RowAction, 'at'> | Omit<SideAction, 'at'>> = {
  contact: { add: 1 },
  sheet: { add: 2 },
  list: { add: 2 },
  csv: { add: 3 },
  calendar: { mark: 'date' },
  checks: { mark: 'done' },
  link: { mark: 'link' },
  notes: { what: 'detail' },
  doc: { what: 'field' },
  bolt: { what: 'automation' },
  brief: { what: 'brief' },
}

/** A beat after the card passes under the screen's edge, so what it brings appears as it arrives. */
const AFTER_LANDING = 0.04
/** How many periods the plan is written for: the opening, and enough repetitions after it for each element to show it repeats (clip.ts). */
const PERIODS = 4

export type ScreenPlan = { rows: RowClips[]; side: SideClips }

/** The screen's part of the hero, from the moments the scene's cards land in it: on a phone, the cards whose arrivals land on panels it hides sit out. */
export function planScreen(scene: Scene): ScreenPlan {
  const actions = Array.from({ length: PERIODS }, (_, n) => visitsOf(scene).map((v) => ({ at: v.absorbAt + LAND * ABSORB + AFTER_LANDING + n * PERIOD, ...brings[v.card.kind] }))).flat()
  return {
    rows: planRows(actions.filter((a): a is RowAction => 'add' in a || 'mark' in a), PERIODS),
    side: planSide(actions.filter((a): a is SideAction => 'what' in a)),
  }
}
