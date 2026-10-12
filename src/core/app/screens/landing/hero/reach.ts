import { ART_REACH, ART_W } from './art/space'

/** How far past the approved art the screen on show reaches, in art units a side, so what enters from the page edge (refilled cards, the light on the ribbons) sets out from beyond the real edge. Up to the art's own width the approved motion is untouched (reach 0); wider screens fall into a few bands, each moving as the widest screen in it, so a resize within a band keeps the motion going and only crossing into another band restarts it from the still. Wide screens show art units as pixels, so a band's reach is half of what it adds to the art's width. */
const BANDS: readonly number[] = [1920, 2560, 3072, 3840, 4480, ART_W + 2 * ART_REACH]

/** The width each band starts above, narrowest first. */
const FLOORS: readonly number[] = [ART_W, ...BANDS.slice(0, -1)]

/** The media queries that pick the band, narrowest first: a screen in band `i` matches the first `i + 1` of them. */
export const REACH_QUERIES: readonly string[] = FLOORS.map((w) => `(width > ${w}px)`)

/** The width above which the first band that can show something needing a screen wider than `width` starts (hero-art.css shows the outward fragments by it). */
export const bandFloor = (width: number): number => FLOORS[BANDS.findIndex((b) => b > width)] ?? FLOORS[FLOORS.length - 1]

/** The reach of the screen on show: 0 at the art's width or less, otherwise the reach of its band (the widest band beyond the art's reach). */
export function reachOnShow(): number {
  const band = REACH_QUERIES.filter((q) => window.matchMedia(q).matches).length
  return band === 0 ? 0 : (BANDS[band - 1] - ART_W) / 2
}
