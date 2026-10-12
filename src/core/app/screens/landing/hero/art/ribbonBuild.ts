import { K_EDGE, scaleAt } from './camera'
import { LAYERS, type Layer } from './depth'
import { centreline, strip, type Pt } from './geometry'
import { nearer, outward, slopeOut } from './outward'
import { ribbonLayer } from './ribbonLayers'
import { ribbonSpecs, type RibbonSpec } from './ribbonData'
import { ART_LEFT, ART_RIGHT } from './space'

export type Ribbon = RibbonSpec & {
  /** Depth band: far strands are slimmer and paler, near strands bolder. */
  layer: Layer
  /** Closed outline of the whole strand. */
  outline: string
  /** Closed outline of the lighter strip, when the strand has one. */
  innerOutline?: string
  /** Narrower outlines stacked inside a soft wash, so its edges fade without a blur filter. */
  softOutlines: readonly string[]
  /** Where the approved strand starts past the page edge, the slope it leaves there with and the camera's scale there: what it carries on outward from on wider screens (outward.ts). */
  end: { at: Pt; slope: number; k: number }
}

/** Outline points per strand: enough to follow the quick narrowing near the screen smoothly. */
const OUTLINE_POINTS = 18
/** Outward of the approved strand, outline points start one approved step apart and space out by this ratio, since the strand straightens and widens slowly out there. */
const OUTWARD_SPACING = 1.25

/** Distances outward of a strand's approved end at which its outline is sampled, from one approved step out to the art's outer edge. */
function outwardSteps(first: number, to: number): number[] {
  const out: number[] = []
  for (let d = first, step = first; d < to; step *= OUTWARD_SPACING, d += step) out.push(d)
  return [...out, to]
}

/** The strand carried on `d` art units outward of its approved end, and the camera's scale there. */
export function beyond(r: Ribbon, d: number): { at: Pt; k: number } {
  return { at: outward(r.end.at, r.end.slope, r.side, d), k: r.end.k * nearer(d) }
}

/** The built ribbons, computed once from the waypoint data and ordered far to near (paint order within a band is the data order). Each strand's width follows the camera: full at the page edge, foreshortened along the funnel, thin where it meets the screen. */
export const ribbons: readonly Ribbon[] = ribbonSpecs.map((spec): Ribbon => {
  const layer = ribbonLayer[spec.id] ?? 1
  const { ribbonWidth, ribbonOpacity } = LAYERS[layer]
  const places = spec.tone === 'hair' ? 1 : 0
  const approved = centreline(spec.way, OUTLINE_POINTS)
  const end = { at: approved[0], slope: slopeOut(centreline(spec.way, 120)), k: scaleAt(...approved[0]) }
  const steps = outwardSteps(Math.hypot(approved[1][0] - approved[0][0], approved[1][1] - approved[0][1]), Math.abs(end.at[0] - (spec.side === 'l' ? ART_LEFT : ART_RIGHT))).reverse()
  const centre = [...steps.map((d) => outward(end.at, end.slope, spec.side, d)), ...approved]
  const widthAt = (k: number) => (spec.from * ribbonWidth * k) / K_EDGE
  const widths = [...steps.map((d) => widthAt(end.k * nearer(d))), ...approved.map(([x, y]) => widthAt(scaleAt(x, y)))]
  return {
    ...spec,
    layer,
    end,
    opacity: ribbonOpacity === 1 ? spec.opacity : (spec.opacity ?? (spec.tone === 'lime' ? 0.84 : 1)) * ribbonOpacity,
    outline: strip(centre, widths, -0.5, 0.5, places),
    softOutlines: spec.tone === 'mist' ? [0.32, 0.15].map((half) => strip(centre, widths, -half, half, places)) : [],
    innerOutline: spec.inner ? strip(centre, widths, spec.inner[0], spec.inner[1], places) : undefined,
  }
}).sort((a, b) => a.layer - b.layer)

/** The ribbons of one depth band, in paint order. */
export const ribbonsIn = (layer: Layer) => ribbons.filter((r) => r.layer === layer)
