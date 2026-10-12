/** Eases a set of animations from standing still to full speed over `ms`, so the motion starts from the composed still without a jolt. Changing the playback rate keeps each animation's current time, so nothing jumps. Returns a function that stops easing (leaving the current rate). */
export function easeIn(animations: readonly Animation[], ms: number): () => void {
  for (const animation of animations) animation.playbackRate = 0
  let start = 0
  let frame = requestAnimationFrame(function step(now) {
    start ||= now
    const p = Math.min(1, (now - start) / ms)
    const rate = p * p * (3 - 2 * p)
    for (const animation of animations) animation.playbackRate = rate
    frame = p < 1 ? requestAnimationFrame(step) : 0
  })
  return () => cancelAnimationFrame(frame)
}
