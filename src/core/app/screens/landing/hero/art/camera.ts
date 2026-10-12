import { ART_H, ART_TOP, ART_W } from './space'

/** The hero is one 3D scene seen by one perspective camera. Everything is authored where it appears on screen (in art units), and its depth comes from one field: a funnel that is near the viewer at the page edges and recedes into the Projects screen, whose centre is the vanishing point. */
export type Point = { readonly x: number; readonly y: number }

/** Camera distance from the picture plane, in art units, and the vanishing point: the centre of the Projects screen. */
export const PERSPECTIVE = 1000
export const ORIGIN: Point = { x: ART_W / 2, y: 624 }
export const ORIGIN_Y_PCT = ((ORIGIN.y - ART_TOP) / ART_H) * 100

/** The screen's half-width and half-height in art units: the funnel's mouth. */
const MOUTH = { x: 289, y: 216 } as const
/** How far out of the funnel a screen point is, in mouths: 1 on the screen's edge. */
const rhoAt = (x: number, y: number) => Math.hypot((x - ORIGIN.x) / MOUTH.x, (y - ORIGIN.y) / MOUTH.y)
/** The funnel's rim: the art's farthest corner, so things keep growing all the way out to every edge of the picture. */
const RIM = Math.max(...[[0, ART_TOP], [0, ART_TOP + ART_H]].map(([x, y]) => rhoAt(x, y)))
const EASE = 1.8
const eased = (r: number) => (r >= 0 ? 1 - Math.pow(1 - r, EASE) : EASE * r)

/** How far out of the funnel a point is: 0 at the screen's edge, 1 at the art's corners and beyond, negative under the screen. */
const reachAt = (x: number, y: number) => Math.min(1, (rhoAt(x, y) - 1) / (RIM - 1))

/** Apparent scale, relative to an object's own size, where the funnel meets the screen's edge (farthest), and at the page's side edges level with the vanishing point: the reference for the size of things at the page edge. */
export const K_FAR = 0.3
export const K_EDGE = 1.16
/** The largest apparent scale in the picture, at its corners. Cards are laid out at this size, so the camera only ever scales them down. */
export const K_NEAR = K_FAR + (K_EDGE - K_FAR) / eased(reachAt(0, ORIGIN.y))

/** Apparent scale at a point on the funnel: near the page edges things are large and change slowly; close to the screen they shrink quickly into it. Under the screen they keep shrinking. */
export function scaleAt(x: number, y: number): number {
  return Math.max(0.08, K_FAR + (K_NEAR - K_FAR) * eased(reachAt(x, y)))
}

/** Depth (toward the viewer is positive) that makes the camera show an object at scale `k`. */
export const depthFor = (k: number) => PERSPECTIVE * (1 - 1 / k)

/** The 3D point the camera shows at screen point `p` with scale `k`. */
export function unproject(p: Point, k: number): { x: number; y: number; z: number } {
  return { x: ORIGIN.x + (p.x - ORIGIN.x) / k, y: ORIGIN.y + (p.y - ORIGIN.y) / k, z: depthFor(k) }
}
