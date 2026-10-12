import { cqw } from '../art/space'
import { layoutSize, poseAt } from './pose'
import { transformOf } from './projection'
import type { Visit } from './visits'

/** A visit's frame in the composed still as CSS custom properties, `--{scene}w`, `h`, `t` (transform), `o` (opacity) and `vo` (depth veil): the card's element carries one set per scene and hero-art.css applies the scene on show, so the still needs no script and each scene starts from its own frame zero. */
export function stillVars(v: Visit, scene: '' | 'p'): Record<string, string | number> {
  const size = layoutSize(v)
  const pose = poseAt(v, 0)
  return {
    [`--${scene}w`]: `${cqw(size.w)}cqw`,
    [`--${scene}h`]: `${cqw(size.h)}cqw`,
    [`--${scene}t`]: transformOf(size, pose),
    [`--${scene}o`]: Number(pose.opacity.toFixed(3)),
    [`--${scene}vo`]: Number(pose.veil.toFixed(3)),
  }
}
