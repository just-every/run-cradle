import { EMPTY_BRIEF, EMPTY_LINE, openingVars } from './hero/screen/opening'

const SPARK = 'M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z'
const spark = <svg viewBox="0 0 16 16" focusable="false" data-ai-spark=""><path d={SPARK} fill="#7d9a7c" /></svg>
const bolt = <svg viewBox="0 0 16 16" focusable="false"><path d="M9.6 1.5 3.5 9.2h4l-1.2 5.3 6.2-7.9H8.4Z" fill="#12372e" /></svg>

/** A wash of light over a side card as something arrives in it. Only while motion is live. */
const Flash = ({ live, name }: { live: boolean; name: string }) => (live ? <s className="lp-flash" data-flash={name} /> : null)

/** A line a card writes in when it lands: its slot is the quiet placeholder, and the line itself lies over it, starting empty as the motion opens (hero/screen/opening.ts). */
function Line({ part, width }: { part: 'detail' | 'field'; width?: string }) {
  return <i className="lp-slot" style={width ? { width } : undefined}>
    <span {...{ [`data-${part}-line`]: '' }} data-opening="" style={openingVars(EMPTY_LINE)} />
  </i>
}

/** The AI brief's lines, at their widths. */
const briefLines = <><i style={{ width: '60%' }} /><i /><i style={{ width: '75%' }} /></>

/** The side column of the hero's Projects screen: a record's details, a field, the project's status chips with its automation, and an AI brief. Decorative only. While `live`, what cards bring into it as they land is mounted too, invisible until its moment. The details, the field and the brief each have quiet placeholders beneath them, which show while they are empty (as the motion opens) or being filled in afresh. */
export function HeroSide({ live }: { live: boolean }) {
  return <div className="lp-project-side">
    <div className="lp-mini-card lp-mini-card--tall"><Line part="detail" /><Line part="detail" /><Line part="detail" /><Line part="detail" width="40%" /><Flash live={live} name="detail" /></div>
    <div className="lp-mini-card lp-mini-card--bar"><Line part="field" width="50%" /><Flash live={live} name="field" /></div>
    <div className="lp-mini-card lp-mini-card--chips"><i style={{ width: '50%', background: '#b5c79b' }} /><span><b style={{ background: '#9fcf94' }} /><b style={{ background: '#b79be8' }} /></span>{live ? <><s className="lp-auto-ring" data-auto-ring="" /><s className="lp-auto" data-auto="">{bolt}</s></> : null}<Flash live={live} name="automation" /></div>
    <div className="lp-mini-card lp-mini-card--ai">
      <div className="lp-ai-body lp-ai-ghost"><svg viewBox="0 0 16 16" focusable="false"><path d={SPARK} /></svg>{briefLines}</div>
      <div className="lp-ai-body" data-ai-body="" data-opening="" style={openingVars(EMPTY_BRIEF)}>{spark}{briefLines}</div>
      <Flash live={live} name="brief" />
    </div>
  </div>
}
