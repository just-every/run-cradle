import { ART_VIEWBOX } from '../art/space'
import { lengthOf, pathOf, trailsOf } from './trail'
import { DASHES } from './trailFrames'

/** The swoops' effects in the art. `Trails`: a faint tail of light behind each swoop, drawn behind the cards as overlapping dashes on the swoop's own path that all end at its head, so it is brightest just behind the card and thins away to nothing, trails the card and never covers it. `Ripple`: one ripple a side where the card passes under the screen, drawn over the screen's edge so the screen visibly takes it in. Rendered only while motion is live; each starts invisible and is driven entirely by the motion layer. Trails are drawn for both scenes; the motion layer lights the ones of the scene on show. */
const sides = ['l', 'r'] as const

export function Trails() {
  return <svg className="lp-trails" viewBox={ART_VIEWBOX} focusable="false">
    {(['wide', 'phone'] as const).flatMap(trailsOf).map((trail) => {
      const d = pathOf(trail), gap = Math.ceil(lengthOf(trail)) + 400
      return <g key={trail.key} data-trail={trail.key} opacity="0">
        {DASHES.map((dash) => <path key={dash} data-dash={dash} d={d} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={dash + 400} />)}
      </g>
    })}
  </svg>
}

export function Ripple() {
  return <div className="lp-stage lp-stage--front">
    {sides.map((side) => <i key={side} className="lp-ripple" data-fx={`ripple-${side}`} />)}
  </div>
}
