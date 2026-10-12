import type { Sequence } from '../sampling'

/** An element of the hero and its part in the motion. */
export type Part = readonly [el: Element, sequence: Sequence]
/** A piece of the motion's set-up: computes the parts of a few elements. Each is small, so start-up can be sliced between them. */
export type Job = () => Part[]

/** Longest stretch of set-up, in milliseconds, before the browser gets a turn. */
const SLICE = 12

const breather = () => new Promise<void>((resolve) => {
  const channel = new MessageChannel()
  channel.port1.onmessage = () => resolve()
  channel.port2.postMessage(null)
})

/** Runs each job and hands its parts to `use`, in slices of at most about SLICE milliseconds with a turn for the browser between them, so start-up never holds the main thread for long. Resolves with everything `use` returned, or with null once `cancelled` reports the motion stopped. */
export async function prepare<T>(jobs: readonly Job[], use: (part: Part) => T[], cancelled: () => boolean): Promise<T[] | null> {
  const out: T[] = []
  let from = performance.now()
  for (const job of jobs) {
    if (performance.now() - from > SLICE) {
      await breather()
      if (cancelled()) return null
      from = performance.now()
    }
    for (const part of job()) out.push(...use(part))
  }
  return cancelled() ? null : out
}
