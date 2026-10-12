import { PERIOD } from '../schedule'

/** A card's float at home: a slow drift on screen and a slight sway in depth, in art units and degrees. Each motion completes a whole number of turns every PERIOD, so it repeats with the rest of the hero. It is zero when the motion begins, so the still shows every card exactly at its approved place, and zero again each time the card is taken in, so every swoop sets out from the card's home; between those moments each card's phases are its own, so neighbouring cards never move together. */
export type Drift = { x: number; y: number; roll: number; tilt: number }

const TURNS = { x: [3, 4], y: [4, 5], roll: [3, 2], tilt: [2, 3] } as const
const AMP = { x: 4.5, y: 6, roll: 1.4, tilt: 4 } as const

/** A wave of `turns` a period through zero at the start and at `at` (sin(w t + p) = sin p again where w t = pi - 2p). */
function wave(turns: number, at: number, t: number): number {
  const w = (2 * Math.PI * turns) / PERIOD
  const phase = (Math.PI - w * at) / 2
  return Math.sin(w * t + phase) - Math.sin(phase)
}

/** The drift at `t` seconds since the motion began of the `n`th card, taken in first at `at`, shown at scale `k` (nearer cards drift further on screen, as one camera sees one motion). */
export function drift(n: number, at: number, t: number, k: number): Drift {
  const pick = (pair: readonly [number, number]) => pair[n % 2]
  return {
    x: AMP.x * k * wave(pick(TURNS.x), at, t),
    y: AMP.y * k * wave(pick(TURNS.y), at, t),
    roll: AMP.roll * wave(pick(TURNS.roll), at, t),
    tilt: AMP.tilt * wave(pick(TURNS.tilt), at, t),
  }
}
