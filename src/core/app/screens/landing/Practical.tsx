import { DocsMore } from './parts/DocsMore'
import { Icon } from './parts/Icon'

/** The practical parts: three hairline-separated rows, each a Display heading and body beside one small card. Quiet hours are a notification setting, so they are a footer line, not an automation. */
export function Practical() {
  return <section className="lp-sec" id="practical" aria-labelledby="practical-title">
    <div className="lp-wrap lp-grid lp-grid--list">
      <div className="lp-intro">
        <p className="lp-eyebrow">Also included</p>
        <h2 id="practical-title">The practical parts.</h2>
        <p>Move data in and out, let routine work run on its own, and ask for a summary when you want one.</p>
      </div>
      <div className="lp-list">
        <div className="lp-row">
          <div><h3>CSV in, CSV out</h3><p>Import a CSV and see what will be created, updated or rejected before anything is saved. Export any view to CSV, with the columns you see.</p><DocsMore slug="importing">Importing a base</DocsMore></div>
          <div className="lp-mini" aria-hidden="true"><span className="lp-lab">Import preview</span><div className="lp-tally"><span className="lp-chip lp-chip--new">12 new</span><span className="lp-chip lp-chip--upd">3 updated</span><span className="lp-chip lp-chip--err">1 error</span></div></div>
        </div>
        <div className="lp-row">
          <div><h3>Automations you can see</h3><p>Automations run on a product event or a schedule, and every run is recorded. Notifications arrive in the app and by email, and most email waits out your quiet hours.</p><DocsMore slug="automations">How record automations work</DocsMore></div>
          <div className="lp-mini" aria-hidden="true"><span className="lp-lab">Automations</span>
            <div className="lp-ln"><strong>When a risk becomes Critical</strong><span>Escalate the risk</span></div>
            <div className="lp-ln"><strong>Every day at 08:00</strong><span>Ask launch owners for readiness</span></div>
            <div className="lp-foot">In-app and email notifications · quiet hours <span className="lp-nowrap">18:00-08:00</span> by default</div>
          </div>
        </div>
        <div className="lp-row">
          <div><h3>AI briefs, read only</h3><p>Optional, clearly labelled, and read-only. A brief summarises your campaigns and risks and never edits a record. With AI off, the rest of Cradle works the same.</p></div>
          <div className="lp-mini" aria-hidden="true"><span className="lp-ai-tag"><Icon name="spark" />AI brief · read-only</span><p className="lp-quote">Two milestones are due this week and one risk is open.</p><div className="lp-foot">Produced today at 08:05 · never edits a record</div></div>
        </div>
      </div>
    </div>
  </section>
}
