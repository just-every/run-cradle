import { offsetIn, type Sequence } from '../sampling'
import { PERIOD } from '../schedule'

export type State = Record<string, string | number>

export const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.25, 1)'
export const EASE_IN = 'cubic-bezier(0.5, 0, 0.75, 0.4)'
export const EASE = 'cubic-bezier(0.45, 0, 0.25, 1)'

type Frame = { t: number; s: State; easing?: string }

const same = (a: State, b: State) => Object.keys(a).every((key) => a[key] === b[key])

/** One element's part in the hero, written as what happens when: it holds its state, then moves to a new one over a time with an easing. Times are seconds since the motion began and must come in order. The plan writes the opening and the repetitions after it; the element then plays the opening once and repeats one period from a moment it is at rest, so no move is ever cut in two. A clip that does not repeat every PERIOD is a broken plan and says so. */
export class Clip {
  private frames: Frame[]
  private now: State
  constructor(private readonly name: string, initial: State) {
    this.now = { ...initial }
    this.frames = [{ t: 0, s: { ...initial } }]
  }

  private at(t: number) {
    const last = this.frames[this.frames.length - 1].t
    if (t < last - 1e-9) throw new Error(`Hero screen plan moves ${this.name} out of order at ${t.toFixed(3)}s`)
  }

  /** From `t`, move to `to` over `dur` seconds. */
  to(t: number, dur: number, to: State, easing = EASE): this {
    this.at(t)
    this.frames.push({ t, s: { ...this.now }, easing }, { t: t + dur, s: { ...this.now, ...to } })
    this.now = { ...this.now, ...to }
    return this
  }

  /** Jump to `to` at `t`, as while the element is out of sight. */
  set(t: number, to: State): this {
    this.at(t)
    this.frames.push({ t, s: { ...this.now } }, { t: t + 1e-4, s: { ...this.now, ...to } })
    this.now = { ...this.now, ...to }
    return this
  }

  get touched(): boolean { return this.frames.length > 1 }

  /** The state at `t`, where the element holds it (not inside a move). */
  private stateAt(t: number): State {
    let s = this.frames[0].s
    for (const f of this.frames) if (f.t <= t + 1e-9) s = f.s
    return s
  }

  /** The first moment at or after `t` at which the element is at rest and not about to move. */
  private restAfter(t: number): number {
    for (let i = 0; i < this.frames.length - 1; i++) {
      const a = this.frames[i], b = this.frames[i + 1]
      if (a.t <= t + 1e-9 && t < b.t - 1e-9 && !same(a.s, b.s)) t = b.t
    }
    return t
  }

  /** The frames in [from, from + span], with the held state at each end. */
  private window(from: number, span: number): Frame[] {
    const inside = this.frames.filter((f) => f.t > from + 1e-9 && f.t < from + span - 1e-9)
    return [{ t: from, s: this.stateAt(from) }, ...inside, { t: from + span, s: this.stateAt(from + span) }]
  }

  /** The opening, up to the first moment of rest after it, then one period from there. The plan must be written through two periods past that moment. */
  sequence(): Sequence {
    const seam = this.restAfter(PERIOD)
    const loop = this.window(seam, PERIOD)
    const next = this.window(seam + PERIOD, PERIOD)
    const moments = [...loop.map((f) => f.t - seam), ...next.map((f) => f.t - seam - PERIOD)]
    if (moments.some((m) => !same(this.stateAt(seam + m), this.stateAt(seam + PERIOD + m)))) {
      throw new Error(`Hero screen plan does not repeat ${this.name} every ${PERIOD}s`)
    }
    const keyframes = (frames: Frame[], from: number, span: number) => frames.map(({ t, s, easing }) => ({ offset: offsetIn(t, from, span), ...s, ...(easing ? { easing } : {}) }))
    return { intro: keyframes(this.window(0, seam), 0, seam), introFor: seam, loop: keyframes(loop, seam, PERIOD) }
  }
}
