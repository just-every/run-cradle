import { useLayoutEffect, useState, type RefObject } from 'react'
import { PHONE_QUERY } from '../cards/layout'
import { REACH_QUERIES } from '../reach'
import { startHeroMotion } from './engine'

/** The breakpoints whose crossing changes the motion: the phone scene, and the bands of screen width that set how far past the approved art the motion reaches (reach.ts). */
const QUERIES = [PHONE_QUERY, ...REACH_QUERIES]

/** Whether the hero's motion is live. False on the server, during hydration and under `prefers-reduced-motion`, so the markup is always the still frame (with motion allowed, its Projects screen opens sparse by CSS alone, hero/screen/opening.ts); true once the client has decided to animate it, which also starts the motion on `root`. Crossing the phone breakpoint swaps the scene, and crossing into another band of screen width moves where refills and the ribbons' light set out from, so either restarts the motion for the screen now shown. */
export function useHeroMotion(root: RefObject<HTMLElement | null>): boolean {
  const [live, setLive] = useState(false)
  const [screen, setScreen] = useState<string | null>(null)

  useLayoutEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: no-preference)')
    const breakpoints = QUERIES.map((q) => window.matchMedia(q))
    const sync = () => { setLive(motion.matches); setScreen(breakpoints.map((b) => (b.matches ? 1 : 0)).join('')) }
    sync()
    for (const query of [motion, ...breakpoints]) query.addEventListener('change', sync)
    return () => { for (const query of [motion, ...breakpoints]) query.removeEventListener('change', sync) }
  }, [])

  useLayoutEffect(() => {
    if (!live || screen === null || !root.current) return
    return startHeroMotion(root.current)
  }, [live, screen, root])

  return live
}
