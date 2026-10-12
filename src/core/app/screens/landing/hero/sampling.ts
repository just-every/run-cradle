import { PERIOD } from './schedule'

/** One element's part in the hero: its `intro`, played once from the composed still over `introFor` seconds, then its `loop`, repeated every PERIOD from where the intro ends. Keyframe offsets are shares of each. */
export type Sequence = { intro: Keyframe[]; introFor: number; loop: Keyframe[] }

/** A moment of the hero's clock and the value of each channel there. */
type Sample = { t: number; v: number[] }

const RATE = 60
const EPS = 1e-4

function simplify(points: Sample[], tolerance: readonly number[]): Sample[] {
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let worst = 0, at = -1
    for (let i = a + 1; i < b; i++) {
      const f = (points[i].t - points[a].t) / (points[b].t - points[a].t)
      let err = 0
      for (let c = 0; c < tolerance.length; c++) err = Math.max(err, Math.abs(points[a].v[c] + (points[b].v[c] - points[a].v[c]) * f - points[i].v[c]) / tolerance[c])
      if (err > worst) { worst = err; at = i }
    }
    if (worst > 1) { keep[at] = 1; stack.push([a, at], [at, b]) }
  }
  return points.filter((_, i) => keep[i])
}

/** Turns a function of the hero's clock over [from, to] into as few samples as keep the browser's straight steps between them within `tolerance` of it (per channel), so curved paths and eased fades stay smooth without thousands of frames. Values may jump only at `jumps`, where two samples share a moment. */
function sampleSpan(fn: (t: number) => number[], tolerance: readonly number[], jumps: readonly number[], from: number, to: number): Sample[] {
  const cuts = [from, ...jumps.filter((t) => t > from && t < to).sort((a, b) => a - b), to]
  const out: Sample[] = []
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1] - (i + 1 < cuts.length - 1 ? EPS : 0)
    const n = Math.max(2, Math.ceil((b - a) * RATE))
    const points = Array.from({ length: n + 1 }, (_, j) => { const t = a + ((b - a) * j) / n; return { t, v: fn(t) } })
    out.push(...simplify(points, tolerance))
  }
  return out
}

/** Samples a function of the hero's clock that repeats every PERIOD from PERIOD on: the opening [0, PERIOD] for the intro and the first repetition [PERIOD, 2 PERIOD] for the loop, both with times since the motion began. A function that does not come back to where its repetition began is a broken plan and says so. */
export function sampleSequence(name: string, fn: (t: number) => number[], tolerance: readonly number[], jumps: readonly number[]): { intro: Sample[]; loop: Sample[] } {
  const start = fn(PERIOD), end = fn(2 * PERIOD)
  if (start.some((v, c) => Math.abs(v - end[c]) > tolerance[c])) throw new Error(`Hero ${name} does not repeat every ${PERIOD}s`)
  return { intro: sampleSpan(fn, tolerance, jumps, 0, PERIOD), loop: sampleSpan(fn, tolerance, jumps, PERIOD, 2 * PERIOD) }
}

/** Keyframe offset of a moment `t` in a span starting at `from` and lasting `span` seconds. */
export const offsetIn = (t: number, from: number, span: number) => Math.min(1, Math.max(0, Math.round(((t - from) / span) * 1e6) / 1e6))

/** A sampled intro and loop as keyframes, each sample made into a frame by `frame`. */
export function framesOf({ intro, loop }: { intro: Sample[]; loop: Sample[] }, frame: (s: Sample) => Keyframe): Sequence {
  return {
    intro: intro.map((s) => ({ ...frame(s), offset: offsetIn(s.t, 0, PERIOD) })),
    introFor: PERIOD,
    loop: loop.map((s) => ({ ...frame(s), offset: offsetIn(s.t, PERIOD, PERIOD) })),
  }
}
