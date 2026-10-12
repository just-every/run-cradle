import type { Registry } from './registry'
import { rand } from './timing'

/** The still's scattered fragments float too: each drifts a few pixels to and fro on its own slow rhythm, easing at both ends, so it starts from exactly where the still has it. Fragments the screen on show does not display (the outward ones beyond its band, hero-art.css) are left still; crossing into another band restarts the motion. */
export function startFragments(root: Element, registry: Registry): void {
  for (const el of root.querySelectorAll<HTMLElement>('.lp-frags i')) {
    if (!el.checkVisibility()) continue
    const to = `translate(${rand(-6, 6).toFixed(1)}px, ${rand(-7, 7).toFixed(1)}px)`
    registry.add(el.animate([{ transform: 'translate(0px, 0px)' }, { transform: to }], { duration: rand(4200, 7600), iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }))
  }
}
