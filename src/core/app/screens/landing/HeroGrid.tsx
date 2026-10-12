import { GridRow } from './hero/screen/GridRow'
import { SHOWN, statuses } from './hero/screen/rows'

const headers = [[12, 4], [26, 26], [80, 14], [120, 14], [155, 16], [190, 18], [240, 14], [285, 10]]
const line = { strokeWidth: 4, strokeLinecap: 'round' } as const

/** The illustrated records grid inside the hero's Projects screen: seven rows of status, owner, link and menu marks. Shapes only, no text. While `live`, the row that waits to arrive and what cards add to rows are mounted too, all invisible until their moment. */
export function HeroGrid({ live }: { live: boolean }) {
  return <svg className="lp-project-grid" viewBox="0 0 320 225" focusable="false">
    <rect width="320" height="25" fill="#f0f2ea" />
    <path d="M70 0v225" stroke="#e3e8dc" />
    <g stroke="#cfd7ca" {...line}>{headers.map(([x, w]) => <path key={x} d={`M${x} 13h${w}`} />)}</g>
    {statuses.map((_, ring) => (ring < SHOWN || live ? <GridRow key={ring} ring={ring} live={live} /> : null))}
  </svg>
}
