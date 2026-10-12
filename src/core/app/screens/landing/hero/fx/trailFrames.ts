import { absorb, smooth, swoopLength } from '../cards/paths'
import { layoutSize, poseAt } from '../cards/pose'
import { projectCard } from '../cards/projection'
import type { Visit } from '../cards/visits'
import { framesOf, sampleSequence, type Sequence } from '../sampling'
import { ABSORB, LAND, occurrences, sinceLast, untilNext } from '../schedule'
import { distanceAt, headingAt, type Trail } from './trail'

/** The light a swoop leaves behind it: overlapping faint dashes along the trail (Fx.tsx draws them), all ending at a head that follows just behind the card, so the light tapers from the card back to nothing. Early in the swoop only the stretch from home to the card is lit, so the light lengthens as the card speeds up; it is brightest mid-swoop and gone as the card lands. Only the dashes' offsets and the trail's opacity move. */
export const DASHES: readonly number[] = [60, 120, 190]
/** Clear space between the light's head and the card's edge, in art units: more than half the dashes' width, so their rounded ends never reach under the card. */
const CLEAR = 8
const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p

/** The swoop under way on this trail at `t` and how far through it is; between swoops, the next one, waiting at its start. */
function swooping(visits: readonly Visit[], t: number): { v: Visit; u: number } {
  for (const v of visits) {
    const since = sinceLast(v.absorbAt, t)
    if (since < ABSORB) return { v, u: since / ABSORB }
  }
  const next = [...visits].sort((a, b) => untilNext(a.absorbAt, t) - untilNext(b.absorbAt, t))[0]
  if (!next) throw new Error('Hero trail has no swoop')
  return { v: next, u: 0 }
}

/** How far the card reaches from its centre along the direction of travel: half its drawn box, measured along that direction. */
function reachOf(v: Visit, t: number, [dx, dy]: [number, number]): number {
  const [x0, y0, x1, y1] = projectCard(layoutSize(v), poseAt(v, t))
  return Math.min((x1 - x0) / 2 / Math.max(1e-6, Math.abs(dx)), (y1 - y0) / 2 / Math.max(1e-6, Math.abs(dy)))
}

/** The light's head (distance along the trail) and its opacity at `t`. */
function channels(trail: Trail, t: number): number[] {
  const { v, u } = swooping(trail.visits, t)
  const length = swoopLength(v.mouth - v.rest)
  const at = (x: number) => distanceAt(trail, absorb(Math.min(1, Math.max(0, x)), length).along)
  const d = at(u)
  const speed = (at(u + 0.01) - at(u - 0.01)) / (0.02 * ABSORB)
  const head = d - reachOf(v, t, headingAt(trail, d)) - CLEAR
  return [head, smooth(120, 480, speed) * (1 - smooth(LAND - 0.03, LAND + 0.07, u))]
}

/** Each swoop's light starts afresh at home; the head moves back only once the swoop is over and the trail is dark. */
const swoopEnds = (visits: readonly Visit[]) => visits.flatMap((v) => occurrences(v.absorbAt + ABSORB))

/** Keyframes for one trail: its opacity, and the offset of each dash (in DASHES order) so it ends at the head. */
export function trailFrames(trail: Trail): { opacity: Sequence; dashes: Sequence[] } {
  const samples = sampleSequence(`trail ${trail.key}`, (t) => channels(trail, t), [0.3, 0.008], swoopEnds(trail.visits))
  return {
    opacity: framesOf(samples, ({ v: [, opacity] }) => ({ opacity: round(opacity, 3) })),
    dashes: DASHES.map((len) => framesOf(samples, ({ v: [head] }) => ({ strokeDashoffset: `${round(len - head)}` }))),
  }
}
