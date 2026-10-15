# Cradle demo

After `rer setup`, run `rer demo` and open its private `RER_OPEN` link. Stop with
`rer demo --stop`. Each start uses fresh `.rer/demo/` state, removed on stop;
the ordinary `.wrangler/state` is retained.

`seedDemo` runs the installed `launch.samples.install` operator command using
the admitted owner's current session. It reuses `sample-data/cradle.json` for
four campaigns, their deliverables, milestones, risks and decisions, the
Northstar workspace and sample colleagues. Colleagues have no login credentials.
The visitor can edit the records and explore the included Launch template.

The first import in `src/server.ts` installs Base's demo guard. The six files in
`src/modules/demo` are from runeditrun/base at
`712c276ff84711f33dd94011ef75b1e1bb236ec5` (rer 0.2.15); only the two operator-auth
import paths in index.mjs point to Cradle's existing vendor directory. Vite uses
Base's socket guard and isolated state path. The guard records refused fetches
and sockets and adds the Demo bar with captured mail and blocked sends.

Demo bindings select the development mail outbox on local and hosted origins.
AI, Google/Xero OAuth, the automation egress relay and construction runner and
candidate deployment credentials are absent, including when saved local
settings contain them. The container additionally has internet disabled and a
denying workerd egress boundary. No outbound deployment can be authorized.
Hosted sign-in uses Base's signed owner claim and the configured app origin.
Ordinary installations retain their existing settings and authentication.

Run demo is manual-only and reads the `run-demo` GitHub environment. Production
uses its real Turnstile widget. `test_only` deploys a separate host at
`demo.test.run-cradle.com` with Cloudflare's published test keys. `test_only`
plus `remove` removes that host; production removal is not offered. No
repository deployment variable is needed. DNS readback follows deployment,
after the new domain has settled across authoritative and public resolvers.

The host limits visits to 60 minutes and 15 idle minutes. In rer 0.2.15 the
provider can stop an idle container sooner (about three minutes); do not rely
on the full idle allowance until the Base fix is adopted.
