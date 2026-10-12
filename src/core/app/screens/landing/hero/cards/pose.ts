import { K_FAR, K_NEAR, ORIGIN } from '../art/camera'
import { ABSORB, PERIOD, occurrences } from '../schedule'
import { drift } from './float'
import { absorb, refill, refillDone, smooth, swoopLength } from './paths'
import { projectCard } from './projection'
import { sample } from './track'
import { ADVANCE, type Visit } from './visits'

/** Where a card is at one moment, as the camera sees it: its centre on screen (art units), apparent scale, turns and visibility. */
export type Pose = { x: number; y: number; k: number; heading: number; tilt: number; roll: number; opacity: number; veil: number }

/** How much of its lane's run into depth a card takes on, floating at home and as it reaches the screen, and how much its in-plane turn follows the lane as it bends, at home and as it reaches the screen. As it is pulled in it turns further into depth and further along its ribbon, so it visibly skews down the funnel, its edge nearer the screen receding. */
const TILT = 0.4
const TIP = 0.78
const ROLL = 0.35
const ROLL_TIP = 0.6
/** Paper veil over the deepest cards: far things are paler, as through air. */
const VEIL = 0.3
/** How far the swoop curves out to the side of its lane, in art units at its widest. */
const CURVE = 16

/** Heading folded so both sides read alike: 0 is straight toward the screen, positive is downward. */
const folded = (heading: number, side: 'l' | 'r') => (side === 'l' ? heading : 180 - heading)

/** The card at arc length `s` along its lane, before the float: its place, scale and turns. Its in-plane turn is its home's, plus a share of how the lane bends away from the home's heading; both that share and its turn into depth grow as `tip` goes from 0 to 1. */
function onLane(v: Visit, s: number, curve: number, tip = 0) {
  const at = sample(v.track, s)
  const home = sample(v.track, v.ref)
  const a = (at.heading * Math.PI) / 180
  // The swoop bows away from the vanishing point's level, then dives into the screen: sideways along the lane's normal, on the side away from that level, by the lane's own bow.
  const nx = -Math.sin(a), ny = Math.cos(a)
  const out = (home.y < ORIGIN.y ? -1 : 1) * (ny >= 0 ? 1 : -1) * (v.track.bow ?? CURVE) * curve
  return {
    x: at.x + nx * out,
    y: at.y + ny * out,
    k: at.k,
    heading: at.heading,
    tilt: (TILT + (TIP - TILT) * tip) * at.dive,
    roll: v.home.rot + (v.home.side === 'l' ? 1 : -1) * (ROLL + (ROLL_TIP - ROLL) * tip) * (folded(at.heading, v.home.side) - folded(home.heading, v.home.side)),
  }
}

/** How far a swoop has bowed out from its lane `along` art units from home: not at all at home, most halfway to the screen's edge, and back on the lane at the edge. */
const curveOf = (v: Visit, along: number) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, along / (v.mouth - v.rest)))), 2)

/** Where a card's swoop carries its centre `along` art units from home: the path it takes into the screen, whatever its pace. */
export function swoopAt(v: Visit, along: number): { x: number; y: number } {
  const { x, y } = onLane(v, v.rest + along, curveOf(v, along))
  return { x, y }
}

const veilFor = (k: number) => VEIL * Math.pow(Math.min(1, Math.max(0, (K_NEAR - k) / (K_NEAR - K_FAR))), 2)

/** The visit's turn under way at `t` (seconds since the motion began): the moments of that turn (refill, glide forward, absorption), or null before the card first sets out. In the first turn, a refill whose place was freed before the motion began, or a glide due before then, is already done, as the still shows it. */
function turnOf(v: Visit, t: number): { refill: number; until: number | null; absorb: number } | null {
  const n = Math.max(0, Math.floor((t - v.refillAt) / PERIOD))
  const first = n === 0
  if (first && t < v.refillAt && v.opensAt >= 0) return null
  return {
    refill: first && v.opensAt < 0 ? -Infinity : v.refillAt + n * PERIOD,
    until: v.wait ? (first && v.wait.until < 0 ? -Infinity : v.wait.until + n * PERIOD) : null,
    absorb: v.absorbAt + n * PERIOD,
  }
}

/** Where a floating card is on its lane: at its home, or, on phones, waiting further out and then gliding forward, easing in and out, as the card ahead of it is taken in. The float eases off a little during the glide. */
function floating(v: Visit, t: number, until: number | null): { s: number; float: number } {
  if (until === null) return { s: v.rest, float: 1 }
  const p = smooth(0, 1, (t - until) / ADVANCE.takes)
  return { s: v.ref + (v.rest - v.ref) * p, float: 1 - 0.6 * Math.sin(Math.PI * p) }
}

/** The card at `t` seconds since the motion began. Pure and deterministic: the server renders t = 0 and the client samples the same function. */
export function poseAt(v: Visit, t: number): Pose {
  const turn = turnOf(v, t)
  let s = 0, curve = 0, grow = refill(0).grow, lean = 0, opacity = 0, float = 0, tip = 0
  if (turn && t - turn.refill < v.refillFor) {
    const r = refill((t - turn.refill) / v.refillFor)
    s = v.ref * r.along; grow = r.grow; opacity = r.opacity; float = r.float
    // On a lane carried on past the approved one, the card fades in over the same stretch from its outer end as on the approved lane, so beyond the page edge.
    if (v.outer) opacity = refill(refillDone(s / (v.ref - v.outer))).opacity
  } else if (turn && t < turn.absorb) {
    ({ s, float } = floating(v, t, turn.until)); grow = 1; opacity = 1
  } else if (turn && t < turn.absorb + ABSORB) {
    const a = absorb((t - turn.absorb) / ABSORB, swoopLength(v.mouth - v.rest))
    s = v.rest + a.along; curve = curveOf(v, a.along); grow = a.grow; lean = a.lean; opacity = a.opacity; float = a.float; tip = a.tip
  }
  // Otherwise it is out of sight until its next refill, waiting beyond the page edge where that refill starts.
  const lane = onLane(v, s, curve, tip)
  const k = lane.k * grow
  const d = drift(v.turn, v.absorbAt, t, (v.scale * sample(v.track, v.ref).k) / K_NEAR)
  return {
    x: lane.x + float * d.x, y: lane.y + float * d.y, k,
    heading: lane.heading,
    tilt: lane.tilt + lean + float * d.tilt,
    roll: lane.roll + float * d.roll,
    opacity,
    veil: veilFor(k),
  }
}

/** The moments at which a visit's pose jumps (only ever while the card is invisible): when it leaves the screen's underside for the page edge. */
export const jumpsOf = (v: Visit): number[] => occurrences(v.absorbAt + ABSORB)

const sizes = new WeakMap<Visit, { w: number; h: number }>()
/** The card's layout box before perspective, in art units: chosen so that, posed and projected where it first arrives, it covers its box in the approved image (times the scene's scale). It is its size at its nearest, so the browser draws it large and only ever scales it down. */
export function layoutSize(v: Visit): { w: number; h: number } {
  let size = sizes.get(v)
  if (!size) {
    const pose = { ...onLane(v, v.ref, 0), opacity: 1, veil: 0 }
    const w = v.card.w * v.scale, h = v.card.h * v.scale
    const trial = { w: (w / pose.k) * K_NEAR, h: (h / pose.k) * K_NEAR }
    const box = projectCard(trial, pose)
    const fit = (w / (box[2] - box[0]) + h / (box[3] - box[1])) / 2
    size = { w: trial.w * fit, h: trial.h * fit }
    sizes.set(v, size)
  }
  return size
}
