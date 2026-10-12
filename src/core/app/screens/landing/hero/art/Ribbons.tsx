import { Fragment } from 'react'
import { ART_VIEWBOX } from './space'
import type { Layer } from './depth'
import { ribbons, ribbonsIn, type Ribbon } from './ribbonBuild'
import type { Tone } from './ribbonData'
import { Sheen, SheenGradient, carriesSheen } from './Sheens'

type Stops = readonly (readonly [number, string])[]

/** Colour along a strand, from its outer edge to the screen. */
const tones: Record<Tone, Stops> = {
  dark: [[0, '#0f352d'], [0.5, '#17473a'], [1, '#0d302c']],
  lime: [[0, '#dcf46a'], [0.5, '#e7f89a'], [1, '#d3ee5c']],
  sage: [[0, '#c8dbc8'], [0.5, '#d9e8d8'], [1, '#b7cfb9']],
  mist: [[0, '#e5ede0'], [0.5, '#dce8d8'], [1, '#d1e1cf']],
  hair: [[0, '#fbfbf7'], [1, '#fbfbf7']],
}
const innerFill: Partial<Record<Tone, { fill: string; opacity: number }>> = {
  dark: { fill: '#4d9478', opacity: 0.32 },
  sage: { fill: '#ffffff', opacity: 0.5 },
}
const LEFT = [-150, 500] as const
const RIGHT = [1686, 1036] as const

const LAYER_ORDER: readonly Layer[] = [0, 1, 2]
const gradientId = (r: Ribbon) => `lp-rg-${r.side}-${r.tone}`

/** One shared gradient per side and tone, running from the outer edge to the screen. */
function Gradients() {
  const used = [...new Set(ribbons.map((r) => `${r.side}-${r.tone}`))]
  return <>{used.map((key) => {
    const [s, tone] = key.split('-') as ['l' | 'r', Tone]
    const [x1, x2] = s === 'l' ? LEFT : RIGHT
    return <linearGradient key={key} id={`lp-rg-${key}`} gradientUnits="userSpaceOnUse" x1={x1} x2={x2} y1="0" y2="0">
      {tones[tone].map(([offset, color]) => <stop key={offset} offset={offset} stopColor={color} />)}
    </linearGradient>
  })}</>
}

/** The ribbons: layered strands, painted far to near, sweeping in from both sides and foreshortening into the Projects screen. They are the same in the composed still and in motion; while `live`, a few strands also carry travelling light, each painted just above its strand. The strands reach ART_REACH beyond each side of the approved art at every width (art/space.ts), drawn past the SVG's box in the same art units, so the widest screen is filled from the server's markup and narrower ones simply clip it. */
export function Ribbons({ live }: { live: boolean }) {
  return <svg className="lp-ribbons" viewBox={ART_VIEWBOX} focusable="false">
    <defs>
      <Gradients />
      <SheenGradient />
      <radialGradient id="lp-glow"><stop offset="0" stopColor="#f3fba6" stopOpacity=".95" /><stop offset=".55" stopColor="#e6f78a" stopOpacity=".38" /><stop offset="1" stopColor="#e6f78a" stopOpacity="0" /></radialGradient>
      {ribbons.map((r) => <path key={r.id} id={`lp-o-${r.id}`} d={r.outline} />)}
      {ribbons.filter(carriesSheen).map((r) => <clipPath key={r.id} id={`lp-k-${r.id}`}><use href={`#lp-o-${r.id}`} /></clipPath>)}
    </defs>
    {LAYER_ORDER.map((layer) => <Fragment key={layer}>
      {ribbonsIn(layer).map((r) => {
        const inner = innerFill[r.tone]
        return <Fragment key={r.id}>
          <g data-ribbon={r.id} opacity={r.opacity ?? (r.tone === 'lime' ? 0.84 : undefined)}>
            <use href={`#lp-o-${r.id}`} fill={`url(#${gradientId(r)})`} opacity={r.softOutlines.length ? 0.38 : undefined} />
            {r.softOutlines.map((d, i) => <path key={i} d={d} fill={`url(#${gradientId(r)})`} opacity={0.4} />)}
            {r.innerOutline && inner ? <path d={r.innerOutline} fill={inner.fill} opacity={inner.opacity} /> : null}
          </g>
          {live && carriesSheen(r) ? <Sheen r={r} /> : null}
        </Fragment>
      })}
    </Fragment>)}
    <ellipse cx="478" cy="600" rx="96" ry="74" fill="url(#lp-glow)" />
    <ellipse cx="1060" cy="592" rx="96" ry="74" fill="url(#lp-glow)" />
  </svg>
}
