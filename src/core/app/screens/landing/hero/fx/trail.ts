import type { Scene } from '../cards/layout'
import { swoopLength } from '../cards/paths'
import { swoopAt } from '../cards/pose'
import { visitsOf, type Visit } from '../cards/visits'

/** The path a swoop's light runs along: the swoop's own path, from the card's home to its end under the screen, as a polyline in art units with the distance along it at each point. One trail serves every swoop along one lane in a scene (on phones, several cards take turns on a lane, all along the same path). */
export type Trail = {
  key: string
  visits: readonly Visit[]
  pts: readonly (readonly [number, number])[]
  /** Distance along the polyline at each point, in art units. Point `i` is where the swoop is `i * STEP` art units of its progress from home (`along`, as `absorb` gives it). */
  at: readonly number[]
}

const STEP = 4
const round = (n: number) => Math.round(n * 10) / 10

function build(key: string, visits: readonly Visit[]): Trail {
  const [v] = visits
  const sameSwoop = (o: Visit) => o.track === v.track && o.rest === v.rest && o.mouth === v.mouth && o.home.at === v.home.at
  if (!visits.every(sameSwoop)) throw new Error(`Hero swoops sharing trail ${key} must share a path`)
  const length = swoopLength(v.mouth - v.rest)
  const n = Math.ceil(length / STEP)
  const pts = Array.from({ length: n + 1 }, (_, i) => { const { x, y } = swoopAt(v, Math.min(length, i * STEP)); return [round(x), round(y)] as const })
  const at = [0]
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  return { key, visits, pts, at }
}

/** Distance along the trail where a swoop `along` art units from home has carried the card. Before home (the anticipation) it is 0. */
export function distanceAt(trail: Trail, along: number): number {
  const f = Math.max(0, along) / STEP
  const i = Math.min(trail.at.length - 2, Math.floor(f))
  return trail.at[i] + (trail.at[i + 1] - trail.at[i]) * Math.min(1, f - i)
}

/** The trail's direction of travel (unit vector) at a distance along it. */
export function headingAt(trail: Trail, d: number): [number, number] {
  let i = trail.at.findIndex((a) => a > d)
  if (i < 1) i = i === 0 ? 1 : trail.at.length - 1
  const [ax, ay] = trail.pts[i - 1], [bx, by] = trail.pts[i]
  const len = Math.hypot(bx - ax, by - ay) || 1
  return [(bx - ax) / len, (by - ay) / len]
}

export const lengthOf = (trail: Trail) => trail.at[trail.at.length - 1]
export const pathOf = (trail: Trail) => `M${trail.pts.map(([x, y]) => `${x} ${y}`).join('L')}`

const cache = new Map<Scene, readonly Trail[]>()
/** The trails of a scene, one per lane its cards are drawn in along, keyed `{scene}-{lane}`. */
export function trailsOf(scene: Scene): readonly Trail[] {
  let trails = cache.get(scene)
  if (!trails) {
    const byLane = new Map<string, Visit[]>()
    for (const v of visitsOf(scene)) byLane.set(v.track.id, [...(byLane.get(v.track.id) ?? []), v])
    trails = [...byLane].map(([lane, visits]) => build(`${scene}-${lane}`, visits))
    cache.set(scene, trails)
  }
  return trails
}
