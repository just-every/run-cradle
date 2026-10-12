import type { ReactNode } from 'react'
import { Strand } from './Strand'

type FeatureProps = {
  id: string
  eyebrow: string
  title: string
  /** Which side of the page the illustration sits on. The strand enters from that outer edge. */
  side: 'left' | 'right'
  copy: ReactNode
  children: ReactNode
}

/** One section: eyebrow, headline and one or two sentences beside a single close-up. Copy spans five columns, the screen seven. */
export function Feature({ id, eyebrow, title, side, copy, children }: FeatureProps) {
  return <section className="lp-sec" id={id} aria-labelledby={`${id}-title`}>
    <div className={`lp-wrap lp-grid lp-grid--art-${side}`}>
      <div className="lp-copy">
        <p className="lp-eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`}>{title}</h2>
        {copy}
      </div>
      <div className="lp-art">
        <Strand side={side} />
        {children}
      </div>
    </div>
  </section>
}
