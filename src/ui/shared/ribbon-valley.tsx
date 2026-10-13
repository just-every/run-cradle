import { ribbonColours } from './ribbon'

/** The public pages' ribbon: three filled bands that run in from both edges and settle into one smooth valley at the centre. */
const W = 1440, MID = 720

/** One band, symmetric about the centre: `edge` is its [top, bottom] at both page edges, `centre` its [top, bottom] where it meets the others. */
function band(edge: [number, number], centre: [number, number]) {
  const [et, eb] = edge, [ct, cb] = centre
  return `M0 ${et} C260 ${et + 6} 470 ${ct} ${MID} ${ct} C${W - 470} ${ct} ${W - 260} ${et + 6} ${W} ${et}`
    + ` L${W} ${eb} C${W - 260} ${eb + 6} ${W - 470} ${cb} ${MID} ${cb} C470 ${cb} 260 ${eb + 6} 0 ${eb} Z`
}

const bands = {
  sage: band([0, 54], [146, 149]),
  deep: band([58, 104], [148, 152]),
  lime: band([110, 148], [152, 158]),
}

/** `short`: the lime band fades out before the bands meet (not found). */
export function RibbonValley({ id, short = false, className }: { id: string; short?: boolean; className?: string }) {
  const c = ribbonColours
  return <svg className={className} viewBox={`0 0 ${W} 170`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-deep`} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#2f5c4c" /><stop offset=".5" stopColor={c.deep} /><stop offset="1" stopColor="#2f5c4c" /></linearGradient>
      <linearGradient id={`${id}-lime`} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#e4f597" /><stop offset=".5" stopColor={c.lime} /><stop offset="1" stopColor="#e4f597" /></linearGradient>
      {short && <linearGradient id={`${id}-gap`} x1="0" x2="1" y1="0" y2="0"><stop offset=".38" stopColor="#fff" /><stop offset=".45" stopColor="#fff" stopOpacity="0" /><stop offset=".55" stopColor="#fff" stopOpacity="0" /><stop offset=".62" stopColor="#fff" /></linearGradient>}
      {short && <mask id={`${id}-short`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height="170"><rect width={W} height="170" fill={`url(#${id}-gap)`} /></mask>}
    </defs>
    <path d={bands.sage} fill="#d3ded2" opacity=".75" />
    <path d={bands.deep} fill={`url(#${id}-deep)`} opacity=".9" />
    <path d={bands.lime} fill={`url(#${id}-lime)`} mask={short ? `url(#${id}-short)` : undefined} />
  </svg>
}
