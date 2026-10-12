import { K_EDGE, scaleAt } from '../art/camera'
import { LAYERS } from '../art/depth'
import { centreline, type Pt } from '../art/geometry'
import { beyond, type Ribbon } from '../art/ribbonBuild'
import { SHEEN_R, sheenOrder } from '../art/Sheens'
import { smooth } from '../cards/paths'
import { framesOf, sampleSequence, type Sequence } from '../sampling'
import { PERIOD } from '../schedule'

/** The motion of the light that travels along a strand (art/Sheens.tsx): a soft oval of light lying along the strand, carried with the flow from beyond the page edge into the screen, turning with the strand and foreshortening as it recedes. It is a pure function of the hero's clock, like the cards, so it eases in with them and repeats with the rest of the hero. On a screen wider than the approved art it sets out as far beyond that screen's edge (reach.ts) and covers the longer way in a little more of its pass, so it moves briskly where the strand is near. */

/** Seconds between one light setting out along a strand and the next: two a period. */
const PASS = PERIOD / 2
/** The share of a pass the light is on its way along the approved strand, and the most of a pass it may take on a wider screen; for the rest it waits, out of sight, at the strand's outer end. */
const TRAVEL = 0.74
const TRAVEL_MOST = 0.9
/** Half the light's length along the strand at the page edge, in art units, and its half-width against the strand's: it narrows and shortens with the strand. */
const HALF_LENGTH = 170
const ACROSS = 1.1
/** Centreline samples per strand, and the spacing of samples beyond the approved strand: enough for the light to follow its curve smoothly. */
const POINTS = 240
const OUTWARD_STEP = 4

type Path = { x: number[]; y: number[]; heading: number[]; length: number[]; half: number[]; flow: number[] }

/** The strand's centreline from `reach` beyond its approved outer end, with its heading, the light's length and half-width at each point, and how far the light has flowed there. It flows at a pace that slows a little as the strand recedes (as the square root of the camera's scale), so it eases into the screen rather than racing or crawling. */
function pathOf(r: Ribbon, reach: number): Path {
  const { ribbonWidth } = LAYERS[r.layer]
  const approved = centreline(r.way, POINTS)
  const out = Array.from({ length: Math.ceil(reach / OUTWARD_STEP) }, (_, i) => beyond(r, reach - i * OUTWARD_STEP))
  const pts: Pt[] = [...out.map(({ at }) => at), ...approved]
  const last = pts.length - 1
  const k = [...out.map((o) => o.k), ...approved.map(([x, y]) => scaleAt(x, y))]
  const p: Path = { x: pts.map(([x]) => x), y: pts.map(([, y]) => y), heading: [], length: [], half: [], flow: [0] }
  pts.forEach(([x, y], i) => {
    const [ax, ay] = pts[Math.max(0, i - 2)], [bx, by] = pts[Math.min(last, i + 2)]
    const h = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
    p.heading.push(r.side === 'r' && h < 0 ? h + 360 : h)
    p.length.push((HALF_LENGTH * k[i]) / K_EDGE / SHEEN_R)
    p.half.push((r.from * ribbonWidth * k[i] * ACROSS) / K_EDGE / 2 / SHEEN_R)
    if (i) p.flow.push(p.flow[i - 1] + Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]) / Math.sqrt((k[i] + k[i - 1]) / 2))
  })
  return p
}

const flowOf = (p: Path) => p.flow[p.flow.length - 1]

/** The light `u` of the way along (0 at the outer end, 1 at the screen) as [x, y, heading, length, width]. */
function along(p: Path, u: number): number[] {
  const target = u * flowOf(p)
  let i = p.flow.findIndex((f) => f >= target)
  if (i < 1) i = 1
  const f = (target - p.flow[i - 1]) / (p.flow[i] - p.flow[i - 1] || 1)
  return [p.x, p.y, p.heading, p.length, p.half].map((v) => v[i - 1] + (v[i] - v[i - 1]) * f)
}

/** The light at `t`: waiting unseen at the outer end until its first pass sets out at `offset`, then a pass every PASS seconds taking `travel` of it. It fades in over the same flow from its outer end, and out over the same flow before the screen, as on the approved strand, whose flow is `share` of this path's. */
function lightAt(p: Path, share: number, travel: number, offset: number, t: number): number[] {
  const local = t < offset ? Infinity : ((t - offset) % PASS) / PASS
  if (local >= travel) return [...along(p, 0), 0]
  const u = local / travel
  const done = u / share, longer = 1 / share - 1
  return [...along(p, u), smooth(0, 0.18, done) * (1 - smooth(0.6 + longer, 0.98 + longer, done))]
}

const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places

/** Keyframes for the light on one strand, on a screen reaching `reach` art units past the approved art. It returns to the outer end only once its pass is over and it is invisible. */
export function sheenFrames(r: Ribbon, reach: number): Sequence {
  const n = sheenOrder.indexOf(r.id)
  if (n < 0) throw new Error(`Hero strand ${r.id} carries no light`)
  const offset = (n * PASS) / sheenOrder.length
  const p = pathOf(r, reach)
  const share = flowOf(pathOf(r, 0)) / flowOf(p)
  const travel = Math.min(TRAVEL_MOST, TRAVEL * Math.sqrt(1 / share))
  const returns = Array.from({ length: 5 }, (_, m) => offset + travel * PASS + m * PASS).filter((t) => t < 2 * PERIOD)
  return framesOf(sampleSequence(`light on ${r.id}`, (t) => lightAt(p, share, travel, offset, t), [0.25, 0.25, 0.25, 0.003, 0.003, 0.004], returns), ({ v: [x, y, h, sx, sy, o] }) => ({
    transform: `translate(${round(x, 2)}px, ${round(y, 2)}px) rotate(${round(h, 2)}deg) scale(${round(sx)}, ${round(sy)})`,
    opacity: round(o),
  }))
}
