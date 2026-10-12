import { ORIGIN } from './camera'
import type { Pt } from './geometry'

/** The scene beyond the approved art, for screens wider than its 1536 units. The approved strands start just past the page edge; each carries on outward from there in the same camera: the funnel keeps coming nearer the viewer, so a strand keeps growing wider and spreads away from the vanishing point's level, as everything does under one perspective. Pure and deterministic, so server and client agree. */

/** How much nearer the viewer the funnel has come `d` art units beyond the approved art's outer end, as a scale factor: 1 there and level with it (so the join has no kink), then growing steadily. */
const GROW = 0.4
const SPAN = 440
export const nearer = (d: number) => 1 + GROW * (Math.hypot(1, d / SPAN) - 1)

/** How far a strand keeps on its own slope as it carries on outward before the spread takes over, in art units; a card's lane keeps to it for a sixth of that. */
const KEEP = 340

/** The direction a centreline leaves its outer end in: the rise in y per art unit outward. */
export function slopeOut(pts: readonly Pt[]): number {
  const [a, b] = [pts[0], pts[Math.min(pts.length - 1, 6)]]
  return (a[1] - b[1]) / (Math.abs(a[0] - b[0]) || 1)
}

const kept = (slope: number, keep: number, d: number) => slope * keep * (1 - Math.exp(-d / keep))
const across = (end: Pt, side: 'l' | 'r', d: number) => end[0] + (side === 'l' ? -d : d)

/** The point `d` art units outward of a strand's approved end (leftward on the left side), for a strand leaving it with `slope`: it keeps to its own course for a while and moves away from the vanishing point's level as it nears the viewer. */
export function outward(end: Pt, slope: number, side: 'l' | 'r', d: number): Pt {
  return [across(end, side, d), ORIGIN.y + (end[1] - ORIGIN.y) * nearer(d) + kept(slope, KEEP, d)]
}

/** The point `d` art units outward of a card lane's approved end: it leaves on its own course and soon levels off, so a card drifting in from the edge of a wide screen comes in at about the height the approved lane enters at, never climbing off the top or bottom of the hero. */
export function laneOutward(end: Pt, slope: number, side: 'l' | 'r', d: number): Pt {
  return [across(end, side, d), end[1] + kept(slope, KEEP / 6, d)]
}
