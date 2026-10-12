/**
 * Logo P3 "Overlap": a crescent C opening to the north-east, cradling a lime disc that overlaps the C's inner edge
 * with a thin carved gap. This module is the one source of the geometry; BrandMark, favicon.svg, favicon.ico and
 * apple-touch-icon.png are all drawn from it (scripts/brand-icons.mjs writes the files).
 *
 * The C is a single plain path. The carve is exact: the C's hollow circle and the gap circle are intersected here, so
 * the path needs no mask, clip or other id-bearing defs and the mark can appear any number of times on a page.
 */

export const P3_VIEWBOX = '0 0 64 64'
export const P3_COLORS = { ink: '#12372e', paper: '#fffefd', lime: '#d7f25b' } as const

type Point = readonly [number, number]
type Circle = { readonly cx: number; readonly cy: number; readonly r: number }

/** Outer edge, the two terminals and the hollow of the C, as drawn in the approved P3 card (viewBox 64). */
const outerStart: Point = [36.45, 4.73]
const outerEnd: Point = [59.33, 37.39]
const outerRadius = 26.03
const hollowStart: Point = [50.98, 35.16]
const hollowEnd: Point = [35.7, 13.33]
const hollowRadius = 15.97

/** The lime disc and the circle that carves the gap around it out of the C. */
export const P3_DISC: Circle = { cx: 33.02, cy: 31.47, r: 14.2 }
const gap: Circle = { cx: P3_DISC.cx, cy: P3_DISC.cy, r: 16.45 }

/** Centre of the circle of the given radius through two points, on the side an SVG arc with these flags takes. */
const arcCentre = ([x1, y1]: Point, [x2, y2]: Point, r: number, large: 0 | 1, sweep: 0 | 1): Point => {
  const hx = (x1 - x2) / 2
  const hy = (y1 - y2) / 2
  const root = Math.sqrt((r * r - hx * hx - hy * hy) / (hx * hx + hy * hy))
  const s = large === sweep ? -root : root
  return [s * hy + (x1 + x2) / 2, -s * hx + (y1 + y2) / 2]
}

const outerCentre = arcCentre(outerStart, outerEnd, outerRadius, 1, 0)
const hollow: Circle = (([cx, cy]) => ({ cx, cy, r: hollowRadius }))(arcCentre(hollowStart, hollowEnd, hollowRadius, 1, 1))

/** The two points where the hollow's edge crosses the gap circle's edge, ordered clockwise from the lower-right terminal. */
const crossings = (): [Point, Point] => {
  const dx = gap.cx - hollow.cx
  const dy = gap.cy - hollow.cy
  const d = Math.hypot(dx, dy)
  const along = (hollow.r * hollow.r - gap.r * gap.r + d * d) / (2 * d)
  const half = Math.sqrt(hollow.r * hollow.r - along * along)
  const mx = hollow.cx + (along * dx) / d
  const my = hollow.cy + (along * dy) / d
  const lower: Point = [mx + (half * dy) / d, my - (half * dx) / d]
  const upper: Point = [mx - (half * dy) / d, my + (half * dx) / d]
  return [lower, upper]
}

const n = (value: number) => String(Number(value.toFixed(3)))
const at = ([x, y]: Point) => `${n(x)} ${n(y)}`
const arc = (r: number, large: 0 | 1, to: Point) => `A${n(r)} ${n(r)} 0 ${large} 1 ${at(to)}`

/** The C with the carved gap: outer arc, lower terminal, hollow to the gap, round the gap, hollow to the upper terminal. */
export const P3_C_PATH = (() => {
  const [lower, upper] = crossings()
  return [
    `M${at(outerStart)}A${n(outerRadius)} ${n(outerRadius)} 0 1 0 ${at(outerEnd)}`,
    `L${at(hollowStart)}`,
    arc(hollowRadius, 0, lower),
    arc(gap.r, 1, upper),
    arc(hollowRadius, 0, hollowEnd),
    'Z',
  ].join('')
})()

/** The extent of the C and disc together, used to centre the mark inside the app-icon tile. */
export const P3_BOUNDS = { minX: outerCentre[0] - outerRadius, maxX: outerEnd[0], minY: outerCentre[1] - outerRadius, maxY: outerCentre[1] + outerRadius }

export type P3Variant = 'tile' | 'paper' | 'dark' | 'mono'

export type P3Layers = {
  viewBox: string
  /** The app-icon tile; present only for the `tile` variant. */
  tile?: { size: number; radius: number; fill: string }
  /** SVG transform that places and scales the glyph; present only for the `tile` variant. */
  transform?: string
  c: { d: string; fill: string }
  disc: { cx: number; cy: number; r: number; fill: string }
}

export const P3_TILE = { size: 64, radius: 14, fill: P3_COLORS.ink, glyphScale: 0.7 } as const

const glyphColors: Record<P3Variant, { c: string; disc: string }> = {
  tile: { c: P3_COLORS.paper, disc: P3_COLORS.lime },
  paper: { c: P3_COLORS.ink, disc: P3_COLORS.lime },
  dark: { c: P3_COLORS.paper, disc: P3_COLORS.lime },
  mono: { c: 'currentColor', disc: 'currentColor' },
}

/** `tileRadius` overrides the tile's corner radius (0 gives the full-bleed square the apple-touch icon needs). */
export const p3Layers = (variant: P3Variant, tileRadius: number = P3_TILE.radius): P3Layers => {
  const { c, disc } = glyphColors[variant]
  const layers: P3Layers = { viewBox: P3_VIEWBOX, c: { d: P3_C_PATH, fill: c }, disc: { ...P3_DISC, fill: disc } }
  if (variant !== 'tile') return layers
  const s = P3_TILE.glyphScale
  const x = P3_TILE.size / 2 - ((P3_BOUNDS.minX + P3_BOUNDS.maxX) / 2) * s
  const y = P3_TILE.size / 2 - ((P3_BOUNDS.minY + P3_BOUNDS.maxY) / 2) * s
  return { ...layers, tile: { size: P3_TILE.size, radius: tileRadius, fill: P3_TILE.fill }, transform: `translate(${n(x)} ${n(y)}) scale(${s})` }
}

/** Margin kept free on each side of the bare mark so the favicon is not clipped by its tab. */
const FAVICON_MARGIN = 2

/**
 * The bare mark for the browser favicon: no tile, the C and disc scaled to fill the viewBox inside a small even margin,
 * the C in ink on light tabs and in paper on dark tabs (the disc stays lime on both).
 */
export const p3FaviconSvg = (): string => {
  const size = 64
  const width = P3_BOUNDS.maxX - P3_BOUNDS.minX
  const height = P3_BOUNDS.maxY - P3_BOUNDS.minY
  const s = (size - 2 * FAVICON_MARGIN) / Math.max(width, height)
  const x = size / 2 - ((P3_BOUNDS.minX + P3_BOUNDS.maxX) / 2) * s
  const y = size / 2 - ((P3_BOUNDS.minY + P3_BOUNDS.maxY) / 2) * s
  const dark = `<style>@media (prefers-color-scheme: dark){.c{fill:${P3_COLORS.paper}}}</style>`
  const glyph = `<path class="c" d="${P3_C_PATH}" fill="${P3_COLORS.ink}"/><circle cx="${P3_DISC.cx}" cy="${P3_DISC.cy}" r="${P3_DISC.r}" fill="${P3_COLORS.lime}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${P3_VIEWBOX}">${dark}<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">${glyph}</g></svg>`
}

/** The same drawing as a standalone SVG document, for the icon files. */
export const p3Svg = (variant: P3Variant, tileRadius?: number): string => {
  const { viewBox, tile, transform, c, disc } = p3Layers(variant, tileRadius)
  const glyph = `<path d="${c.d}" fill="${c.fill}"/><circle cx="${disc.cx}" cy="${disc.cy}" r="${disc.r}" fill="${disc.fill}"/>`
  const body = tile
    ? `<rect width="${tile.size}" height="${tile.size}" rx="${tile.radius}" fill="${tile.fill}"/><g transform="${transform}">${glyph}</g>`
    : glyph
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`
}
