import type { Scene } from '../cards/layout'
import type { Clip } from '../screen/clip'
import { planScreen, type ScreenPlan } from '../screen/plan'
import { statuses } from '../screen/rows'
import type { Job, Part } from './prepare'
import { part } from './scene'

/** The set-up of the Projects screen's part of the hero for the scene on show: rows arriving and moving, what cards add to rows, and the side panel's arrivals. The plan is made once, as a slice of its own; then each row, then the side panel. Each element has one clip; one that never changes is left alone. */
export function screenJobs(root: Element, scene: Scene): Job[] {
  let plan: ScreenPlan | null = null
  const planned = () => (plan ??= planScreen(scene))
  const play = (el: Element, clip: Clip | null): Part[] => (clip?.touched ? [[el, clip.sequence()]] : [])
  const rows = statuses.map((_, ring): Job => () => {
    const clips = planned().rows[ring]
    const row = part<SVGGElement>(root, `[data-row="${ring}"]`)
    return [
      ...play(row, clips.row),
      ...play(part(row, '[data-row-hl]'), clips.hl),
      ...play(part(row, '[data-row-date]'), clips.date),
      ...(clips.done ? play(part(row, '[data-row-done]'), clips.done) : []),
      ...play(part(row, '[data-row-link]'), clips.link),
    ]
  })
  const side: Job = () => {
    const { side } = planned()
    const lines = [...root.querySelectorAll('[data-detail-line]')]
    if (lines.length !== side.detailLines.length) throw new Error(`Hero detail card has ${lines.length} lines, the plan ${side.detailLines.length}`)
    return [
      ...lines.flatMap((el, i) => play(el, side.detailLines[i])),
      ...play(part(root, '[data-field-line]'), side.fieldLine),
      ...play(part(root, '[data-auto]'), side.auto),
      ...play(part(root, '[data-auto-ring]'), side.autoRing),
      ...play(part(root, '[data-ai-body]'), side.aiBody),
      ...play(part(root, '[data-ai-spark]'), side.aiSpark),
      ...Object.entries(side.flash).flatMap(([name, clip]) => play(part(root, `[data-flash="${name}"]`), clip)),
    ]
  }
  return [() => (planned(), []), ...rows, side]
}
