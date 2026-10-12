import { Link } from '@tanstack/react-router'

/** The closing call to action, held by two converging ribbons. The link names this deployment's persisted workspace. */
export function Closing({ workspaceName }: { workspaceName: string }) {
  return <section className="lp-close" id="start" aria-labelledby="closing-title">
    <div className="lp-wrap">
      <h2 id="closing-title">Your records are waiting.</h2>
      <p>Open the workspace to pick up your tables, views and automations.</p>
    </div>
    <div className="lp-cta">
      <svg className="lp-cta-strand" aria-hidden="true" focusable="false"><use href="#lp-strand" /></svg>
      <Link className="lp-go" to="/signin">{`Sign in to ${workspaceName}`}</Link>
      <svg className="lp-cta-strand lp-cta-strand--r" aria-hidden="true" focusable="false"><use href="#lp-strand" /></svg>
    </div>
  </section>
}
