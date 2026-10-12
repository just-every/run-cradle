import { smooth } from '../cards/paths'
import { sample } from '../cards/track'
import type { Visit } from '../cards/visits'
import { ART_TOP, cqw } from '../art/space'
import { framesOf, sampleSequence, type Sequence } from '../sampling'
import { ABSORB, LAND, occurrences, sinceLast, untilNext } from '../schedule'

/** The ripple where each card enters the screen: one soft disc of light with no edge (hero-live.css), which opens out from the point the card passed under the screen's edge and fades, so the screen's edge brightens for a moment as it takes the card in. One element per side serves every landing on that side; landings on a side never overlap, and it moves between them only while invisible. */
export const RIPPLE = 110
/** How long a ripple lasts after its landing. */
const SPAN = 0.75
const round = (n: number, p = 3) => Math.round(n * 10 ** p) / 10 ** p

const landing = (v: Visit) => v.absorbAt + LAND * ABSORB

/** The latest landing on this side at or before `t` and the time since it; once its ripple is spent, the next landing, waiting to begin. */
function ripplingAt(visits: readonly Visit[], t: number): { v: Visit; e: number } {
  const last = [...visits].sort((a, b) => sinceLast(landing(a), t) - sinceLast(landing(b), t))[0]
  if (!last) throw new Error('Hero ripple needs at least one visit a side')
  const e = sinceLast(landing(last), t)
  if (e < SPAN) return { v: last, e }
  const next = [...visits].sort((a, b) => untilNext(landing(a), t) - untilNext(landing(b), t))[0]
  return { v: next, e: SPAN }
}

/** The ripple's centre (art units), scale and opacity at `t`. */
export function rippleAt(visits: readonly Visit[], t: number): [x: number, y: number, scale: number, opacity: number] {
  const { v, e } = ripplingAt(visits, t)
  const { x, y } = sample(v.track, v.mouth)
  if (e >= SPAN) return [x, y, 0.35, 0]
  const p = e / SPAN
  return [x, y, 0.35 + 0.65 * (1 - Math.pow(1 - p, 3)), 0.9 * smooth(0, 0.1, p) * Math.pow(1 - p, 1.6)]
}

/** Where the ripple moves on to the next landing, invisibly: as each ripple is spent. */
const spent = (visits: readonly Visit[]) => visits.flatMap((v) => occurrences(landing(v) + SPAN))

export function rippleFrames(visits: readonly Visit[]): Sequence {
  return framesOf(sampleSequence('ripple', (t) => rippleAt(visits, t), [0.3, 0.3, 0.008, 0.008], spent(visits)), ({ v: [x, y, scale, opacity] }) => ({
    transform: `translate(${round(cqw(x - RIPPLE / 2))}cqw, ${round(cqw(y - ART_TOP - RIPPLE / 2))}cqw) scale(${round(scale)})`,
    opacity: round(opacity),
  }))
}
