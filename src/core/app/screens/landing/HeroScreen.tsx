import { BrandMark } from '../../ui/brand-mark'
import { HeroGrid } from './HeroGrid'
import { HeroSide } from './HeroSide'

/** The illustrated Projects screen the ribbons stream into: a status grid and a side column of small cards. Decorative only. While motion is allowed it opens sparse and fills as the cards land (hero/screen/opening.ts); while `live`, what cards bring into it as they land is mounted too, invisible until its moment. */
export function HeroScreen({ live }: { live: boolean }) {
  return <div className="lp-project" aria-hidden="true">
    <div className="lp-rail"><BrandMark className="lp-rail-mark" /><b /><b /><b /><b /><b /></div>
    <div className="lp-project-main">
      <div className="lp-project-head"><div className="lp-project-title">Projects</div><div className="lp-project-tabs"><span className="lp-project-tab lp-project-tab--on">Grid</span><span className="lp-project-tab">Board</span><span className="lp-project-tab">Form</span></div></div>
      <div className="lp-project-layout">
        <HeroGrid live={live} />
        <HeroSide live={live} />
      </div>
    </div>
  </div>
}
