import type { ReactNode } from 'react'
import { BrandMark } from '../../../ui/brand-mark'

type Tab = 'Grid' | 'Board' | 'Form'

/** A close-up of Cradle's own screen: the dark sidebar sliver, a Display title and (optionally) the Grid/Board/Form pills. Purely illustrative. */
export function Screen({ title, tab, children }: { title: string; tab?: Tab; children: ReactNode }) {
  return <div className="lp-screen" aria-hidden="true">
    <div className="lp-side"><BrandMark className="lp-side-mark" /><span className="lp-bar lp-bar--on" /><span className="lp-bar" /><span className="lp-bar" /><span className="lp-bar" /></div>
    <div className="lp-main">
      <div className="lp-head">
        <div className="lp-title">{title}</div>
        {tab && <div className="lp-tabs">{(['Grid', 'Board', 'Form'] as const).map(name => <span key={name} className={name === tab ? 'lp-tab lp-tab--on' : 'lp-tab'}>{name}</span>)}</div>}
      </div>
      {children}
    </div>
  </div>
}
