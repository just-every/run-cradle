# Cradle handover

Public source: https://github.com/just-every/cradle.

Use README.md and AGENTS.md's rer commands for every checkout. The native product
runs on one emitted Cloudflare Worker with Hono HTTP families and TanStack Start
documents. Base operator-auth owns credentials and one-use confirmation; Cradle
projects them into current product authority. First-run `/setup` is durable.

The CLI uses reviewed Base source for lifecycle, state custody, outbox, reset and
portability. Business DB/FILES transfer preserves IDs, rows and bytes; generated
columns recompute. Restore does not reauthorize credentials or background effects.
A fresh owner is admitted through the ordinary setup/sign-in path. Historical
imports retain original custody and require explicit continuation.

`node scripts/rer.mjs verify` is the full local product wall. The optional Docker
runner is separate. Source locks are refreshed through `pnpm source:lock`; delivery
metadata and workflow are generated from packaging.json. A clean-history export
is the publication candidate, under just-every/cradle.

Local checks, exact-head CI and publication scans establish their stated source
and local-runtime boundaries. Hosted management/editor installation, account
provisioning, real email and outbound provider delivery require owner commissioning.
No deployment, public push or tag is implied by source readiness.

Local serving adopts Base `56d2eadbd094cfe31c7f155da3355afe6fccf7de`
(m1 full verify 24/24). Setup uses Base's production preview target behind
rer's public listener. Dev still uses Vite internally; its filesystem allows
only application folders and the Base modules, manifest and sample fixture
that Cloudflare's Worker runner requests before recording their imports.
Private installer/key folders and export archives are denied. New Base copies
are refreshed with export-cli and refresh-base; their existing exact-copy
inventory and source origins remain authoritative.

Apply `migrations/updates/9022_domain_rules_step_up.sql` after 9021. All earlier
migrations retain their bytes. The seed's real rer journeys declare
`RER_SERVER_JOURNEY=1`. The uninvoked isolated browser scripts
`tests/ui-command-identity.mjs` and `tests/ui-local-draft.mjs` were removed.
