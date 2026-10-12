# Document rendering

Cradle uses TanStack Start for React documents and generated server functions.
Hono owns `/health`, `/api`, `/api/*`, `/auth`, `/auth/*`, `/oauth/*`,
`/webhooks/*` and `/mcp`. `/api/editor/config` has its current-owner gate before
dispatch. Start owns the public landing, sign-in, protected `/app` documents and
the themed not-found page. Documents require current Base credentials; generated
functions and API requests independently enforce current product authority.
Private server modules stay out of browser bundles. Use README.md's rer path to
start a checkout.

## Measured local runtime

Root's emitted-runtime receipt names
source `a164c514cb36e365bf8089d0cf554400424b3eff`, Node 22.20.0, pnpm 10.12.4 and
real local setup, `rer dev`, emitted `rer preview`, workerd, D1/R2 and native
owner sign-in. Its request matrix
matches all **80/80** expected responses: every Hono family and Start documents,
signed-out/current/expired/revoked sessions, mismatched Host, and CSRF and
foreign-origin mutation refusals without writes. The earlier public scheduled
200/404 divergence is closed by the sanctioned incoming Base refresh; setup,
dev and preview now return 404 without the checkout key.

The actual built artifact exports default `fetch`, `queue` and `scheduled`, and
`InstallationCoordinator`. The emitted queue acknowledges a health envelope and
retries an unsupported one; the scheduled handler completes against migrated
local D1. The bound Coordinator refuses a missing owner with 403 and initializes
the current setup owner with 204. These observations establish local runtime
behavior, not hosted triggers or provider delivery. A binding-only
`getPlatformProxy` warning is not a failure of the running emitted Worker.

Migration byte comparison keeps all
71 files from conversion baseline `58c462735659a7c65a636bf6b8721d057ee9343e`
byte-identical. All 94 migration files from incoming main are also unchanged;
there are 97 current SQL files, including additive lifecycle migrations
9023–9025. No applied migration is edited. The separate
prior-record receipt proves existing
records and the applied ledger survive upgrade and native owner editing.

Root's focused verification at
`a164c514cb36e365bf8089d0cf554400424b3eff` passes the four unchanged
`tests/start-runtime.mjs`, `tests/start-resources.mjs`, `tests/http-smoke.mjs` and
`tests/migration-history.mjs` checks. The Start checks exercise real documents
and generated `/_serverFn/` transport on the emitted Worker. Before merging a
candidate, its own full `node scripts/rer.mjs verify` must pass and include the
Start and migration stages. The final Cradle-6 report records that exact release
identity and CI run; these local receipts alone do not assert full-wall or
hosted acceptance.

## Secret and evidence boundary

The runtime scanner checks 16 actual setup/issued private values against public
responses, safe evidence and a 202,386-byte archive: zero matches. Its archive
has one segment and no binary objects; populated-file proof belongs to the
separate lifecycle journey. Two raw owner-only CLI ready URLs contain the dev
key, one under dev and one under preview. The unchanged strict assertion exits
1 for these matches. The literal no-secret-in-any-log clause remains pending
upstream Base handling; neither public leakage nor hosted security acceptance
is inferred. Raw logs stay private and untracked.

Historical refusals and the former scheduled divergence retain their original
source qualification in the evidence folder. Root's
cleanup receipt proves all three
owned child processes closed, the listener disappeared and a direct recheck confirms the private scratch is absent. No admission or security assertion was waived.
