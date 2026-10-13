import { DocsMore } from './parts/DocsMore'

/** The closing call to action, held by two converging ribbons: Run Cradle, to the Run page. */
export function Closing() {
  return <section className="lp-close" id="start" aria-labelledby="closing-title">
    <div className="lp-wrap">
      <h2 id="closing-title">Your records are waiting.</h2>
      <p>Open the workspace to pick up your tables, views and automations.</p>
    </div>
    <div className="lp-cta">
      <svg className="lp-cta-strand" aria-hidden="true" focusable="false"><use href="#lp-strand" /></svg>
      <a className="lp-go" href="/run">Run Cradle</a>
      <svg className="lp-cta-strand lp-cta-strand--r" aria-hidden="true" focusable="false"><use href="#lp-strand" /></svg>
    </div>
    <div className="lp-close-more"><DocsMore slug="" size="lead">Read the docs</DocsMore></div>
  </section>
}
