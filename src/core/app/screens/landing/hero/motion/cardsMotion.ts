import type { Scene } from '../cards/layout'
import { visitFrames } from '../cards/frames'
import { rippleFrames } from '../fx/rippleFrames'
import { trailsOf } from '../fx/trail'
import { DASHES, trailFrames } from '../fx/trailFrames'
import type { Job, Part } from './prepare'
import { part, shownVisits } from './scene'

/** The set-up of every card of the scene on show, one card at a time: its visit as an intro from the composed still (each starts exactly at the server-rendered frame) and its loop, for the card's transform and opacity and for its depth veil. Then the light on each swoop's trail and each side's ripple. */
export function cardJobs(root: Element, scene: Scene, reach: number): Job[] {
  const visits = shownVisits(root, scene, reach)
  return [
    ...visits.map(({ visit, el }): Job => () => {
      const frames = visitFrames(visit)
      return [[el, frames.card], [part(el, '.lp-fc-veil'), frames.veil]]
    }),
    ...trailsOf(scene).map((trail): Job => () => {
      const el = part<SVGGElement>(root, `[data-trail="${trail.key}"]`)
      const frames = trailFrames(trail)
      return [[el, frames.opacity], ...DASHES.map((dash, i): Part => [part(el, `[data-dash="${dash}"]`), frames.dashes[i]])]
    }),
    ...(['l', 'r'] as const).map((side): Job => () => [[part(root, `[data-fx="ripple-${side}"]`), rippleFrames(visits.map(({ visit }) => visit).filter((v) => v.home.side === side))]]),
  ]
}
