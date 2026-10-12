import { K_NEAR, ORIGIN, PERSPECTIVE, depthFor } from '../art/camera'
import { ART_TOP, cqw } from '../art/space'

type Size = { w: number; h: number }

/** The camera's distance in container-width units, for the cards' container. */
export const PERSPECTIVE_CQW = cqw(PERSPECTIVE)
type Placed = { x: number; y: number; k: number; heading: number; tilt: number; roll: number }

const round = (n: number, places = 3) => { const f = 10 ** places; return Math.round(n * f) / f }
const rad = (d: number) => (d * Math.PI) / 180

/** Where the card's centre sits in the 3D scene so that the camera shows it at its screen point and scale. A card's layout box is its size at its nearest (scale K_NEAR), so every card sits at or behind the picture plane. */
function placeOf(pose: Placed) {
  const depth = pose.k / K_NEAR
  return { x: ORIGIN.x + (pose.x - ORIGIN.x) / depth, y: ORIGIN.y + (pose.y - ORIGIN.y) / depth, z: depthFor(depth) }
}

/** The CSS transform that, under the scene's perspective on the cards' container, shows a card at its pose: placed in depth so it projects onto its lane at its scale, turned to its heading and tipped back by its tilt about the axis across its travel, so the edge nearer the screen recedes, then turned in-plane. */
export function transformOf(size: Size, pose: Placed): string {
  const p = placeOf(pose)
  return `translate3d(${round(cqw(p.x - size.w / 2))}cqw, ${round(cqw(p.y - ART_TOP - size.h / 2))}cqw, ${round(cqw(p.z))}cqw) rotate(${round(pose.heading, 2)}deg) rotateY(${round(pose.tilt, 2)}deg) rotate(${round(pose.roll - pose.heading, 2)}deg)`
}

/** The on-screen bounding box (art units) of a card of `size` at a pose, computed exactly as the browser composes `transformOf` with the scene's perspective. */
export function projectCard(size: Size, pose: Placed): [number, number, number, number] {
  const p = placeOf(pose)
  const [a, b, c] = [rad(pose.roll - pose.heading), rad(pose.tilt), rad(pose.heading)]
  const xs: number[] = [], ys: number[] = []
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    let x = (u * size.w) / 2, y = (v * size.h) / 2, z = 0
    ;[x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
    ;[x, z] = [x * Math.cos(b) + z * Math.sin(b), -x * Math.sin(b) + z * Math.cos(b)]
    ;[x, y] = [x * Math.cos(c) - y * Math.sin(c), x * Math.sin(c) + y * Math.cos(c)]
    const f = PERSPECTIVE / (PERSPECTIVE - (p.z + z))
    xs.push(ORIGIN.x + (p.x + x - ORIGIN.x) * f)
    ys.push(ORIGIN.y + (p.y + y - ORIGIN.y) * f)
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
