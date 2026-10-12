import { Feature } from './parts/Feature'
import { Icon } from './parts/Icon'
import { Screen } from './parts/Screen'

const stats = [['1', 'field touched', ''], ['24', 'records affected', ''], ['24', 'values removed', ' lp-stat--warn']] as const

/** The schema-change preview: what a removal touches, affects and takes away, with the recovery export ready. */
export function Changes() {
  return <Feature id="changes" eyebrow="Safe changes" title="Change with confidence." side="right"
    copy={<p>Before a schema change applies, Cradle shows the fields it touches, the records it affects and any values it would remove. Removed values get a recovery export.</p>}>
    <Screen title="Remove field “Budget”">
      <p className="lp-sub">Nothing changes until you apply.</p>
      <div className="lp-stats">{stats.map(([figure, label, tone]) => <div key={label} className={`lp-stat${tone}`}><b>{figure}</b><span>{label}</span></div>)}</div>
      <div className="lp-rec"><Icon name="check" />Recovery export ready<span>budget-values.csv</span></div>
      <div className="lp-btns"><span className="lp-btn">Cancel</span><span className="lp-btn lp-btn--go">Apply change</span></div>
    </Screen>
  </Feature>
}
