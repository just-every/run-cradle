import { DocsMore } from './parts/DocsMore'
import { Icon } from './parts/Icon'

const tiles = [['Worker', 'the app'], ['D1', 'your records'], ['R2', 'your files']] as const

/** Ownership on the 1200px grid: an illustrated Cloudflare account beside the copy, in the deep-green panel. */
export function Ownership() {
  return <section className="lp-sec lp-sec--own" id="ownership" aria-labelledby="ownership-title">
    <div className="lp-wrap">
      <div className="lp-panel lp-grid lp-grid--art-left">
        <div className="lp-copy">
          <p className="lp-eyebrow">Ownership</p>
          <h2 id="ownership-title">Yours to run and change.</h2>
          <p>Cradle runs in your own Cloudflare account as one Worker with D1 and R2. It is MIT licensed and sends no telemetry.</p>
          <p>Change the source, schema and screens with your own coding agents. Updates keep what you changed.</p>
          <div className="lp-more-row"><DocsMore slug="install">Install it</DocsMore><DocsMore slug="leaving">Leave with your data</DocsMore></div>
        </div>
        <div className="lp-art" aria-hidden="true">
          <div className="lp-acct">
            <span className="lp-lab">Your Cloudflare account</span>
            <div className="lp-tiles">{tiles.map(([name, label]) => <div key={name} className="lp-tile"><b>{name}</b><span>{label}</span></div>)}</div>
            <div className="lp-yours"><b>You change</b><span className="lp-pill">Source</span><span className="lp-pill">Schema</span><span className="lp-pill">Screens</span></div>
            <div className="lp-keep"><Icon name="check" />Updates keep what you changed</div>
          </div>
        </div>
      </div>
    </div>
  </section>
}
