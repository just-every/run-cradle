import { Fragments } from './art/Fragments'
import { Ribbons } from './art/Ribbons'
import { Cards } from './cards/Cards'
import { Ripple, Trails } from './fx/Fx'

/** The hero's vector art: ribbons sweeping in from both sides behind the Projects screen, with cards floating on them. The ribbons reach on past the approved art to the edges of the widest screens in the same markup at every width. Server markup is frame zero of the motion, so motion continues from exactly what is on screen; `live` adds what only exists while moving (the light travelling along a few strands, the light on each swoop's trail and the ripple where it lands, and on phones the cards that take their turn later), each of which starts out of sight. Decorative: hidden from assistive technology and never focusable. */
export function HeroArt({ live }: { live: boolean }) {
  return <div className="lp-hero-art" aria-hidden="true">
    <div className="lp-stage">
      <div className="lp-back">
        <Ribbons live={live} />
        <Fragments />
        {live ? <Trails /> : null}
      </div>
      <Cards live={live} />
    </div>
    {live ? <Ripple /> : null}
  </div>
}
