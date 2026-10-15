# Cradle handover

Public source: https://github.com/just-every/run-cradle.

Use README.md and AGENTS.md's rer commands for every checkout. The native product
runs on one emitted Cloudflare Worker with Hono HTTP families and TanStack Start
documents. Base operator-auth owns credentials and one-use confirmation; Cradle
projects them into current product authority. First-run `/setup` is durable.

The CLI uses reviewed Base source for lifecycle, state custody, outbox, reset and
portability. Business DB/FILES transfer preserves IDs, rows and bytes; generated
columns recompute. Restore does not reauthorize credentials or background effects.
A fresh owner is admitted through the ordinary setup/sign-in path. Historical
imports retain original custody and require explicit continuation.

`rer verify` is the full local product wall. The optional Docker
runner is separate. Source locks are refreshed through `pnpm source:lock`; delivery
metadata and workflow are generated from packaging.json. Development and
releases happen in the public repository just-every/run-cradle.

Local checks, exact-head CI and publication scans establish their stated source
and local-runtime boundaries. Hosted management/editor installation, account
provisioning, real email and outbound provider delivery require owner commissioning.
No deployment, public push or tag is implied by source readiness.

Local serving adopts Base `56d2eadbd094cfe31c7f155da3355afe6fccf7de`
(m1 full verify 24/24). Setup uses Base's production preview target behind
rer's public listener. Dev still uses Vite internally; its filesystem allows
only application folders and the Base modules, manifest and sample fixture
that Cloudflare's Worker runner requests before recording their imports.
Private installer/key folders and export archives (`**/exports/**`) are denied, so
no source folder may be named `exports`. New Base copies
are refreshed with export-cli and refresh-base; their existing exact-copy
inventory and source origins remain authoritative.

Apply the `migrations/updates` group in order through
`9033_oidc_dependencies.sql` (the latest); repair accounting mappings are added by
`migrations/updates/9032_repair_accounting_mapping.sql`. All earlier migrations retain their bytes. The seed's real rer journeys declare
`RER_SERVER_JOURNEY=1`. The uninvoked isolated browser scripts
`tests/ui-command-identity.mjs` and `tests/ui-local-draft.mjs` were removed.

Dependency advisories (15 October 2026): `pnpm audit --prod` reports none. The
dev-only advisories in undici (<7.29.1) and sharp (<0.35.5) arrive through
miniflare 5.20260907.0-alpha, the local test runtime; they are not in the deployed
Worker. Overriding them changes miniflare's pnpm instance path, which tests load
directly, so they are left for the next miniflare/wrangler upgrade. ajv moved to 8.18.0.


Optional OIDC uses the existing Base `/auth` door. Set `IDENTITY_PROVIDER` to the
HTTPS origin of a provider implementing the Base identity dependency contract, then
use the signed-in owner's `/auth/settings/identity` page to approve or disable the
link. A new installation with no approved provider keeps email sign-in unchanged.
Removing an environment value does not revoke an already approved link; disable
or unlink it in identity settings. Existing Cradle membership and current grants
remain authoritative after either sign-in method.
