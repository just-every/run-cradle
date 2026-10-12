import { LAND } from '../schedule'

/** The shapes of a card's two journeys, as functions of the share of the journey done (0 to 1). Pure numbers; pose.ts applies them along the card's lane. */

export const smooth = (lo: number, hi: number, n: number) => { const t = Math.min(1, Math.max(0, (n - lo) / (hi - lo))); return t * t * (3 - 2 * t) }

/** Anticipation: the first share of an absorption, in which the card eases back along its lane by BACK art units, grows a touch and leans away, then holds for an instant before it is pulled in. */
const ANTICIPATE = 0.26
const BACK = 11
/** The swoop's acceleration: distance grows as this power of time, so it starts gently and is moving fast as it reaches the screen. */
const PULL = 2.4
const LAND_Q = (LAND - ANTICIPATE) / (1 - ANTICIPATE)

/** The length of the whole swoop, home to its end under the screen, for a home `toMouth` art units before the screen's edge: chosen so every card reaches the edge at the same moment of its absorption, which is when what it carries appears in the screen. */
export const swoopLength = (toMouth: number) => (toMouth + BACK) / Math.pow(LAND_Q, PULL) - BACK

export type Absorb = {
  /** Distance moved along the lane from home, in art units (negative while anticipating). */
  along: number
  grow: number
  lean: number
  opacity: number
  /** How much of the float still shows: it gives way to the pull. */
  float: number
  /** How far the card has turned to lie along the funnel it is pulled down: 0 at home, 1 as it nears the screen's edge. */
  tip: number
}

export function absorb(u: number, length: number): Absorb {
  const back = u < ANTICIPATE ? Math.pow(Math.sin((Math.PI / 2) * (u / ANTICIPATE)), 2) : 1
  const q = Math.max(0, (u - ANTICIPATE) / (1 - ANTICIPATE))
  const along = -BACK * back + (length + BACK) * Math.pow(q, PULL)
  return {
    along,
    grow: 1 + 0.035 * back * (1 - smooth(0, 0.35, q)),
    lean: -5 * back * (1 - smooth(0, 0.3, q)) + 14 * q * q,
    // It dissolves into the screen's edge as it reaches it, while still large enough to be seen going in.
    opacity: 1 - smooth(LAND - 0.13, LAND + 0.03, u),
    float: 1 - smooth(0, ANTICIPATE, u),
    tip: smooth(0, 0.8, q),
  }
}

export type Refill = { along: number; grow: number; opacity: number; float: number }

/** A refill, from beyond the page edge (`along` 0) to home (`along` 1): it drifts in, slowing all the way until it settles, fading in as it crosses the page edge and growing to its full size, then picks up its float. */
const SETTLE = 1.8

export function refill(u: number): Refill {
  return {
    along: 1 - Math.pow(1 - u, SETTLE),
    grow: 0.82 + 0.18 * smooth(0, 0.8, u),
    opacity: smooth(0.06, 0.45, u),
    float: smooth(0.5, 1, u),
  }
}

/** The share of a refill done when it has come `along` of the way (the inverse of `refill`'s `along`); negative before it sets out. */
export const refillDone = (along: number) => 1 - Math.pow(1 - Math.min(1, along), 1 / SETTLE)
