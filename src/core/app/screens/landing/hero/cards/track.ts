import { scaleAt, unproject } from '../art/camera'
import { centreline, type Pt } from '../art/geometry'
import { laneOutward, slopeOut } from '../art/outward'
import { laneSpecs, type LaneSpec } from './lanes'

/** A lane built for travel: dense equal steps along it with the camera's scale, the heading on screen and the turn into depth at each. Positions along it are arc lengths in art units from its outer end. Pure and deterministic, so server and client agree. */
export type Track = LaneSpec & {
  pts: readonly Pt[]
  scale: readonly number[]
  /** Direction of travel on screen, in degrees, continuous along the lane (right-hand lanes run near 180). */
  heading: readonly number[]
  /** How steeply the lane runs away from the viewer in the 3D scene, in degrees: 0 across the picture, 90 straight into it. */
  dive: readonly number[]
  /** Arc length of one step, and of the whole lane. */
  step: number
  length: number
}

const STEPS = 480
const STENCIL = 4

/** A track through `pts`, `step` apart, with the camera's `scale` at each: the heading on screen and the turn into depth come from the points around each. */
function withTurns(spec: LaneSpec, pts: readonly Pt[], scale: readonly number[], step: number): Track {
  const last = pts.length - 1
  const space = pts.map(([x, y], i) => unproject({ x, y }, scale[i]))
  const around = (i: number) => [Math.max(0, i - STENCIL), Math.min(last, i + STENCIL)] as const
  const heading = pts.map((_, i) => {
    const [a, b] = around(i)
    const h = (Math.atan2(pts[b][1] - pts[a][1], pts[b][0] - pts[a][0]) * 180) / Math.PI
    return spec.side === 'r' && h < 0 ? h + 360 : h
  })
  const dive = pts.map((_, i) => {
    const [a, b] = around(i)
    const [p, q] = [space[a], space[b]]
    return (Math.atan2(p.z - q.z, Math.hypot(q.x - p.x, q.y - p.y)) * 180) / Math.PI
  })
  return { ...spec, pts, scale, heading, dive, step, length: step * last }
}

function build(spec: LaneSpec): Track {
  const pts = centreline(spec.way, STEPS)
  return withTurns(spec, pts, pts.map(([x, y]) => scaleAt(x, y)), Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]))
}

const tracks: ReadonlyMap<string, Track> = new Map(laneSpecs.map((spec) => [spec.id, build(spec)]))

/** A lane carried on `reach` art units further out than its approved outer end, for wider screens (reach.ts): it leaves the approved end on its own course and soon levels off (art/outward.ts), in the same equal steps, at the approved end's scale. The approved part is the very same points, so a card there is exactly where the approved lane has it. */
function extend(track: Track, reach: number): Track {
  const slope = slopeOut(track.pts)
  const fine = Array.from({ length: Math.ceil(reach) + 1 }, (_, i) => laneOutward(track.pts[0], slope, track.side, Math.min(reach, i)))
  const out: Pt[] = []
  for (let i = 1, walked = 0, next = track.step; i < fine.length; i++) {
    const [a, b] = [fine[i - 1], fine[i]]
    const span = Math.hypot(b[0] - a[0], b[1] - a[1])
    for (; next <= walked + span; next += track.step) {
      const f = (next - walked) / span
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
    }
    walked += span
  }
  return withTurns(track, [...out.reverse(), ...track.pts], [...out.map(() => track.scale[0]), ...track.scale], track.step)
}

const extended = new Map<string, Track>()

/** The lane a card takes on a screen reaching `reach` art units past the approved art (0: the approved lane). */
export function trackOf(id: string, reach = 0): Track {
  const track = tracks.get(id)
  if (!track) throw new Error(`Hero card names an unknown lane: ${id}`)
  if (reach === 0) return track
  const key = `${id} ${reach}`
  let wide = extended.get(key)
  if (!wide) extended.set(key, (wide = extend(track, reach)))
  return wide
}

/** Arc length at which the lane passes nearest to a point: where a card stands at home. */
export function arcNearest(track: Track, [x, y]: Pt): number {
  let best = 0
  track.pts.forEach(([px, py], i) => { if (Math.hypot(px - x, py - y) < Math.hypot(track.pts[best][0] - x, track.pts[best][1] - y)) best = i })
  return best * track.step
}

/** Arc length of the first step that meets `test`, searching outward from the lane's outer end. */
export function arcWhere(track: Track, test: (p: Pt) => boolean): number {
  const i = track.pts.findIndex(test)
  if (i < 0) throw new Error(`Hero lane ${track.id} never meets its condition`)
  return i * track.step
}

/** Position, scale, heading and dive at an arc length along the lane, interpolated between steps. Beyond either end the lane carries on straight, so a path may overshoot it smoothly. */
export function sample(track: Track, s: number): { x: number; y: number; k: number; heading: number; dive: number } {
  const last = track.pts.length - 1
  const f = Math.min(last, Math.max(0, s / track.step))
  const lo = Math.min(last - 1, Math.floor(f)), t = f - lo, hi = lo + 1
  const mix = (v: readonly number[]) => v[lo] + (v[hi] - v[lo]) * t
  const [x0, y0] = track.pts[lo], [x1, y1] = track.pts[hi]
  const over = s < 0 ? s : s > track.length ? s - track.length : 0
  const end = s < 0 ? 0 : last
  const a = (track.heading[end] * Math.PI) / 180
  return { x: x0 + (x1 - x0) * t + Math.cos(a) * over, y: y0 + (y1 - y0) * t + Math.sin(a) * over, k: mix(track.scale), heading: mix(track.heading), dive: mix(track.dive) }
}
