import { ribbons } from '../art/ribbonBuild'
import { carriesSheen } from '../art/Sheens'
import { sheenFrames } from '../fx/sheenFrames'
import type { Job } from './prepare'
import { part } from './scene'

/** The set-up of the light travelling along each strand that carries it, one strand at a time, setting out from beyond the edge of a screen reaching `reach` past the approved art. */
export function sheenJobs(root: Element, reach: number): Job[] {
  return ribbons.filter(carriesSheen).map((r): Job => () => [[part(root, `[data-sheen="${r.id}"]`), sheenFrames(r, reach)]])
}
