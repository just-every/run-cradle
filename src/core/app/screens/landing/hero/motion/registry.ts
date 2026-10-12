/** Every running animation of the hero, so they can all be paused together (off screen, hidden tab) or cancelled when motion stops. */
export type Registry = {
  /** Tracks an animation; if the hero is currently paused, the animation starts paused too. */
  add(animation: Animation): Animation
  pause(): void
  resume(): void
  cancelAll(): void
}

export function createRegistry(): Registry {
  const live = new Set<Animation>()
  let paused = false
  const drop = (a: Animation) => () => { live.delete(a) }
  return {
    add(animation) {
      live.add(animation)
      animation.addEventListener('finish', drop(animation))
      animation.addEventListener('cancel', drop(animation))
      if (paused) animation.pause()
      return animation
    },
    pause() {
      paused = true
      for (const a of live) a.pause()
    },
    resume() {
      paused = false
      for (const a of live) a.play()
    },
    cancelAll() {
      for (const a of [...live]) a.cancel()
      live.clear()
    },
  }
}

/** Keeps the registry paused while the hero is off screen or the tab is hidden. Returns a function that stops watching. */
export function pauseWhenOut(root: Element, registry: Registry): () => void {
  let visible = true
  const sync = () => (visible && !document.hidden ? registry.resume() : registry.pause())
  const observer = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting
    sync()
  })
  observer.observe(root)
  document.addEventListener('visibilitychange', sync)
  return () => {
    observer.disconnect()
    document.removeEventListener('visibilitychange', sync)
  }
}
