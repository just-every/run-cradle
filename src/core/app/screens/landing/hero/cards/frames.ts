import { framesOf, sampleSequence, type Sequence } from '../sampling'
import { jumpsOf, layoutSize, poseAt, type Pose } from './pose'
import { transformOf } from './projection'
import type { Visit } from './visits'

const channels = (p: Pose) => [p.x, p.y, p.k, p.heading, p.tilt, p.roll, p.opacity, p.veil]
/** How closely the keyframes follow the pose: art units, scale, degrees, opacity. */
const TOLERANCE = [0.12, 0.12, 0.0015, 0.08, 0.08, 0.05, 0.006, 0.004]
const round = (n: number) => Math.round(n * 1000) / 1000

/** A card's visit as an intro from the composed still (its first frame is exactly the server-rendered one) and the loop it hands over to: its transform and opacity, and its depth veil. Where it leaves the screen's underside for the page edge it is invisible, and the jump happens between two keyframes at the same moment, so it never sweeps across the scene. */
export function visitFrames(v: Visit): { card: Sequence; veil: Sequence } {
  const size = layoutSize(v)
  const samples = sampleSequence(`card ${v.card.id}`, (t) => channels(poseAt(v, t)), TOLERANCE, jumpsOf(v))
  return {
    card: framesOf(samples, ({ v: [x, y, k, heading, tilt, roll, opacity] }) => ({ transform: transformOf(size, { x, y, k, heading, tilt, roll }), opacity: round(opacity) })),
    veil: framesOf(samples, ({ v: c }) => ({ opacity: round(c[7]) })),
  }
}
