import type { Sequence } from '../sampling'
import { PERIOD } from '../schedule'
import type { Registry } from './registry'

/** Plays an element's part of the hero, registered so it pauses and stops with the rest: its intro once, from the composed still, then its loop for as long as the hero moves. Both start now, on one clock: the loop waits out the intro and takes over at the very moment the intro ends, so only one of them ever applies to the element (neither holds a frame outside its own time), and the element's time always reads as seconds since the motion began. Returns both, so the caller can ease them in together. */
export function playSequence(registry: Registry, el: Element, { intro, introFor, loop }: Sequence): Animation[] {
  return [
    registry.add(el.animate(intro, { duration: introFor * 1000, easing: 'linear' })),
    registry.add(el.animate(loop, { delay: introFor * 1000, duration: PERIOD * 1000, iterations: Infinity, easing: 'linear' })),
  ]
}
