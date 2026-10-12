import type { Pt } from '../art/geometry'
import { ABSORB, FIRST, PAUSE, PERIOD, REFILL, absorbAt, order } from '../schedule'
import { SCREEN_EDGE } from './lanes'
import { cardById, cards, type CardSpec, type Scene } from './layout'
import { arcNearest, arcWhere, trackOf, type Track } from './track'

/** A place a card first floats at: on a lane, at a point, turned in-plane by `rot`. */
export type Home = { lane: string; at: Pt; rot: number; side: 'l' | 'r' }

/** One card's turns in a scene, one every PERIOD: it drifts in from the page edge to its home (starting at `refillAt` and taking `refillFor` seconds), floats there, and is drawn into the screen at `absorbAt`. On phones it first waits at an outer place on the same lane and glides forward to its home at `wait.until`, as the card ahead of it is taken in. The times are those of its first turn, in seconds since the motion began, each turn after it PERIOD later: `opensAt`, the moment its place is freed for it (the card before it there is taken in or moves on), comes before `refillAt`, which comes before `wait.until` and `absorbAt`. When its place is freed before the motion begins, the still already shows the card there, and when the card ahead moved on before then, the still shows it moved forward. */
export type Visit = {
  card: CardSpec
  /** Where the card is first placed: its in-plane turn and side apply there. */
  home: Home
  track: Track
  /** Arc lengths along the lane: where the card floats when it is taken in, where it first arrives (the same, unless it waits), and where it passes under the screen. */
  rest: number
  ref: number
  mouth: number
  wait: { until: number } | null
  opensAt: number
  absorbAt: number
  refillAt: number
  refillFor: number
  /** How much of the lane lies beyond its approved outer end, in art units: 0 on the approved lane; on a wider screen, how much further out than the approved lane the card's refill sets out, so it still comes in from beyond the page edge (reach.ts). */
  outer: number
  /** The card's size where it first arrives against its size in the approved image. */
  scale: number
  /** Its place in the order, which sets the pace of its float. */
  turn: number
}

/** Where the lane passes under the Projects screen: past its side edge on wide screens; on phones, where the screen spans the page, under its top edge, which meets the scene at art y 560 (hero.css). */
const PHONE_SCREEN_TOP = 560
function mouthOf(track: Track, scene: Scene): number {
  const past = ([x]: Pt) => (track.side === 'l' ? x >= SCREEN_EDGE.l : x <= SCREEN_EDGE.r)
  return arcWhere(track, scene === 'wide' ? past : ([, y]) => y >= PHONE_SCREEN_TOP)
}

/** The wide scene on a screen reaching `reach` art units past the approved art: each card floats at its approved place on its own lane, and its place is refilled by the same card a pause after it is taken in, drifting in from beyond the page edge. A wider screen's longer drift in takes longer, growing as the square root of the distance, so it is brisker but not hurried. */
function wideVisits(reach: number): Visit[] {
  return cards.map((card) => {
    const approved = trackOf(card.id)
    const track = trackOf(card.id, reach)
    const turn = order.indexOf(card.id)
    const rest = arcNearest(track, card.at)
    const outer = (track.pts.length - approved.pts.length) * track.step
    return {
      card, home: { lane: card.id, at: card.at, rot: card.rot, side: card.side }, track,
      rest, ref: rest, mouth: mouthOf(track, 'wide'), wait: null,
      opensAt: absorbAt(turn) - PERIOD, absorbAt: absorbAt(turn), refillAt: absorbAt(turn) - PERIOD + ABSORB + PAUSE,
      refillFor: outer ? REFILL * Math.sqrt(rest / (rest - outer)) : REFILL, outer,
      scale: 1, turn,
    }
  })
}
const wide: readonly Visit[] = wideVisits(0)
const wider = new Map<number, readonly Visit[]>()

/** On a phone the scene is barely wider than the viewport and the Projects screen covers all but its top, so each side keeps two cards above the screen on one lane, drawn larger: one near the screen, one waiting further out. The near one is taken in; the waiting one glides forward into its place and a fresh card drifts in to wait. The cards take their turns in the wide scene's order, sides alternating, evenly spaced over the same period; the two whose arrivals land on panels a phone does not show sit out. */
const PHONE = 1.85
/** How long after the near card starts to be taken in the waiting card glides forward, and how long its glide takes. */
export const ADVANCE = { after: 0.35, takes: 1.7 } as const
const phoneLanes: Record<'l' | 'r', { lane: string; out: Pt; near: Pt; rot: number }> = {
  l: { lane: 'sheet', out: [190, 286], near: [426, 362], rot: 6 },
  r: { lane: 'calendar', out: [1345, 300], near: [1136, 428], rot: -6 },
}
const PHONE_SKIPS: readonly string[] = ['bolt', 'doc']
/** A phone's queue moves on every turn on its side, so a fresh card sets out for the outer place soon after it opens and arrives before the card ahead glides on. */
const PHONE_REFILL = { pause: 0.3, takes: 3 } as const

function phoneVisits(): Visit[] {
  const turns = order.filter((id) => !PHONE_SKIPS.includes(id))
  const sideOf = (n: number): 'l' | 'r' => (n % 2 ? 'r' : 'l')
  const at = (n: number) => FIRST + (n * PERIOD) / turns.length
  return turns.map((id, n) => {
    const side = sideOf(n)
    const queue = turns.map((_, m) => ({ m, at: at(m) })).filter(({ m }) => sideOf(m) === side)
    const j = queue.findIndex(({ m }) => m === n)
    // The absorption `back` places before this one on its side, in this period or the last.
    const before = (back: number) => { const i = j - back; return i >= 0 ? queue[i].at : queue[i + queue.length].at - PERIOD }
    const { lane, out, near, rot } = phoneLanes[side]
    const track = trackOf(lane)
    const turn = order.indexOf(id)
    const refillAt = before(2) + ADVANCE.after + PHONE_REFILL.pause
    const until = before(1) + ADVANCE.after
    if (refillAt + PHONE_REFILL.takes > until) throw new Error(`Hero phone card ${id} would still be arriving when its queue moves on`)
    return {
      card: cardById(id), home: { lane, at: out, rot, side }, track,
      rest: arcNearest(track, near), ref: arcNearest(track, out), mouth: mouthOf(track, 'phone'),
      wait: { until },
      opensAt: before(2) + ADVANCE.after, absorbAt: at(n), refillAt, refillFor: PHONE_REFILL.takes, outer: 0,
      scale: PHONE, turn,
    }
  })
}
const phone: readonly Visit[] = phoneVisits()

/** The visits of one scene, the wide one on a screen reaching `reach` art units past the approved art (reach.ts; the composed still is the same at every reach). */
export function visitsOf(scene: Scene, reach = 0): readonly Visit[] {
  if (scene === 'phone') return phone
  if (reach === 0) return wide
  let visits = wider.get(reach)
  if (!visits) wider.set(reach, (visits = wideVisits(reach)))
  return visits
}
export const visitOf = (scene: Scene, id: string): Visit | undefined => visitsOf(scene).find((v) => v.card.id === id)
/** Every card has a visit in the wide scene. */
export function wideVisit(id: string): Visit {
  const v = visitOf('wide', id)
  if (!v) throw new Error(`Hero card has no place in the wide scene: ${id}`)
  return v
}
