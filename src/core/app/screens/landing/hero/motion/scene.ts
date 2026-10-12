import { PHONE_QUERY, type Scene } from '../cards/layout'
import { visitsOf, type Visit } from '../cards/visits'

/** The scene on show (hero-art.css picks it by the same breakpoint). */
export const sceneOnShow = (): Scene => (window.matchMedia(PHONE_QUERY).matches ? 'phone' : 'wide')

/** One element of the hero that the motion layer drives; a missing one is a broken hero, not something to skip. */
export function part<T extends Element = HTMLElement>(root: Element, selector: string): T {
  const el = root.querySelector<T>(selector)
  if (!el) throw new Error(`Hero part missing from the page: ${selector}`)
  return el
}

/** The visits of the scene on show, on a screen reaching `reach` past the approved art, each with the card element it moves. */
export function shownVisits(root: Element, scene: Scene, reach: number): { visit: Visit; el: HTMLElement }[] {
  return visitsOf(scene, reach).map((visit) => ({ visit, el: part(root, `[data-card="${visit.card.id}"]`) }))
}
