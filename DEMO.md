# Cradle demo

Run `rer demo` and open its private `RER_OPEN` link. Stop with `rer demo --stop`.
Each start uses fresh `.rer/demo/` state, removed on stop; ordinary local data is
retained. The signed-in navigation and document titles read **Cradle Demo**.
There is no demo bar or captured-mail outbox.

`seedDemo` runs the installed `launch.samples.install` operator command using
the admitted owner's session. It reuses `sample-data/cradle.json` for four
campaigns, deliverables, milestones, risks and decisions, the Northstar workspace
and sample colleagues. Colleagues have no login credentials. Visitors can edit
records and explore the included Launch template.

All vendored Base modules, including demo, operator-auth, owner-claim and mail,
are refreshed together from `rer-v0.2.38`. The first import in `src/server.ts`
installs Base's demo effects. Vite supplies the guarded sockets, isolated state
path and demo bindings. Public internet reads run for real; people-facing writes
complete with provider-shaped success without sending. Base silently suppresses
invitation and sign-in mail. No mail payload is saved or shown.

Demo bindings remove saved external credentials. Launch analysis uses the current
authorized sample records to return a plausible result through `demoEffect`,
without making a model request. Ordinary installations retain
their configured providers, settings and authentication. Hosted sign-in uses
Base's signed owner claim and the configured app origin.

Run demo is manual-only and reads the `run-demo` GitHub environment. Production
uses its real Turnstile widget. `test_only` deploys a separate host at
`demo.test.run-cradle.com` with Cloudflare's published test keys. `test_only`
plus `remove` removes that host and reads back its removal. Production removal
is not offered. DNS and start-page readback follow deployment.

The host limits visits to 60 minutes and 15 idle minutes. Each visitor gets
fresh migrated state and their own signed-in workspace.
