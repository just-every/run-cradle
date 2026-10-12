import { reachOnShow } from '../reach'
import { cardJobs } from './cardsMotion'
import { easeIn } from './ease'
import { startFragments } from './fragments'
import { prepare } from './prepare'
import { createRegistry, pauseWhenOut } from './registry'
import { sceneOnShow } from './scene'
import { screenJobs } from './screenMotion'
import { playSequence } from './sequence'
import { sheenJobs } from './sheenMotion'

/** How long the motion takes to ease from the composed still to full speed: short, so the first card is under way almost at once. */
const EASE_IN_MS = 450

/** Runs the hero's motion on top of its server-rendered still frame. The scene on screen is already frame zero of every card's, the screen's and the travelling light's intro. Their keyframes are computed a slice at a time, so start-up never blocks the page, and each animation is created standing still at that frame; once all exist they ease from standing still to full speed together, on one clock, and hand over to their loops on it. The floating fragments, which the still shows at rest, start on their own. Everything pauses off screen and in hidden tabs. Returns a function that stops it and leaves the still. */
export function startHeroMotion(root: HTMLElement): () => void {
  const registry = createRegistry()
  const stopWatching = pauseWhenOut(root, registry)
  const scene = sceneOnShow()
  const reach = scene === 'wide' ? reachOnShow() : 0
  let stopped = false
  let stopEasing = () => {}
  const hold = (animations: Animation[]) => { for (const a of animations) a.playbackRate = 0; return animations }
  void prepare([...cardJobs(root, scene, reach), ...screenJobs(root, scene), ...sheenJobs(root, reach)], ([el, sequence]) => hold(playSequence(registry, el, sequence)), () => stopped).then((animations) => {
    if (!animations) return
    stopEasing = easeIn(animations, EASE_IN_MS)
    startFragments(root, registry)
  })
  return () => {
    stopped = true
    stopEasing()
    stopWatching()
    registry.cancelAll()
  }
}
