import { ORIGIN } from './camera'
import { nearer } from './outward'
import { bandFloor } from '../reach'
import { ART_REACH, ART_W, cqw, pctX, pctY } from './space'

type Fragment = readonly [x: number, y: number, w: number, h: number, rot: number, color: string]

const LIME = '#d7f25b', DEEP = '#2f5d4c', SAGE = '#a9c3ad', MIST = '#e9efe3'

/** Small scattered data fragments, as in the approved image: lime and green slivers and dots drifting between the strands. */
const approved: readonly Fragment[] = [
  [196, 366, 26, 13, 22, LIME], [160, 410, 22, 11, 20, LIME], [10, 612, 26, 18, 0, LIME], [346, 690, 20, 9, 30, LIME], [84, 790, 30, 14, -16, LIME],
  [284, 438, 14, 8, 24, DEEP], [388, 448, 18, 9, 28, DEEP], [246, 596, 20, 10, 0, DEEP], [356, 676, 15, 8, -20, SAGE], [276, 614, 15, 9, 10, SAGE],
  [32, 258, 28, 12, 28, MIST], [354, 786, 12, 7, -25, SAGE], [376, 566, 11, 7, 12, SAGE],
  [1202, 334, 22, 12, -22, LIME], [1456, 710, 36, 20, 0, LIME], [1428, 322, 18, 10, 14, LIME], [1288, 440, 16, 9, 12, LIME],
  [1458, 504, 30, 15, 0, DEEP], [1172, 410, 14, 8, -20, DEEP], [1209, 788, 14, 8, 26, DEEP], [1104, 466, 10, 7, 8, DEEP],
  [1124, 728, 14, 8, 20, SAGE], [1244, 756, 20, 9, 8, MIST], [1134, 590, 12, 8, 0, SAGE],
]

/** Beyond the approved art, as far as the ribbons reach (art/space.ts), the same fragments carry on at about the same density: spread away from the vanishing point's level and grown like the strands they drift between (art/outward.ts), so a wider screen finds them all the way to its edges. Placed by a fixed sequence, so server and client agree; none comes within 270 units of the approved art, so screens up to its width never show one. */
const PER_SIDE = 12
const LOOKS: readonly (readonly [w: number, h: number, rot: number, color: string])[] = [
  [26, 13, 22, LIME], [16, 9, -18, DEEP], [22, 11, 14, SAGE], [30, 15, 0, LIME], [14, 8, 26, DEEP], [28, 12, -24, MIST], [18, 10, 10, LIME],
]
const outward: readonly Fragment[] = (['l', 'r'] as const).flatMap((side) => Array.from({ length: PER_SIDE }, (_, i): Fragment => {
  const d = 120 + ((i + 0.5) / PER_SIDE) * (ART_REACH - 80)
  const level = 250 + (((side === 'l' ? 0.31 : 0.77) + i * 0.618034) % 1) * 560
  const [w, h, rot, color] = LOOKS[(i * 3 + (side === 'l' ? 0 : 2)) % LOOKS.length]
  const g = nearer(d)
  return [side === 'l' ? -150 - d : ART_W + 150 + d, ORIGIN.y + (level - ORIGIN.y) * g, w * g, h * g, side === 'l' ? rot : -rot, color]
}))

/** The screen width an outward fragment first shows at. Wide screens centre the art and show art units as pixels, so a screen `vw` wide shows art x from `(ART_W - vw) / 2` to `(ART_W + vw) / 2`; the fragment counts from `h + 8` units further in, to cover its rotation and drift. */
function showsFrom([x, , w, h]: Fragment): number {
  const reach = h + 8
  return x < 0 ? ART_W - 2 * (x + w + reach) : 2 * (x - reach) - ART_W
}

const style = ([x, y, w, h, rot, color]: Fragment) => ({ left: pctX(x), top: pctY(y), width: `${cqw(w)}cqw`, height: `${cqw(h)}cqw`, background: color, rotate: `${rot}deg` })

/** The still frame's fragments. They carry no meaning; once motion is live each drifts gently about its place (motion/fragments.ts). The outward ones carry the band of screen width that first shows them (reach.ts) and are displayed only from that band on (hero-art.css), so narrower screens neither paint nor animate them. */
export function Fragments() {
  return <div className="lp-frags">
    {approved.map((f) => <i key={`${f[0]}-${f[1]}`} style={style(f)} />)}
    {outward.map((f) => <i key={`${f[0]}-${f[1]}`} data-from={bandFloor(showsFrom(f))} style={style(f)} />)}
  </div>
}
