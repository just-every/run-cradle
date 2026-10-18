# Cradle agent guide

## Run it locally

Install Node 22 or later, then install this checkout’s package dependencies
(`pnpm install --frozen-lockfile`) and run `pnpm exec rer install`. The package-pinned
rer 0.2.59 then provisions this project’s
pinned Node 22.20.0 and pnpm 10.12.4. See the README for platform prerequisites
and the alternative installer. Start a checkout through these commands:

```sh
rer dev
rer dev --stop
rer verify
rer export --output exports/workspace.rer
rer reset --yes
rer import --input exports/workspace.rer --yes
rer deploy --dry-run
rer describe
```

`rer dev` installs dependencies and prepares the local owner automatically; no
answers file is needed, including after reset/import. Optional
`rer setup --owner-email you@example.com` chooses an owner email before launch;
`--answers` accepts an owner-only (0600) JSON file with manifest answers. See
README.md. `dev` opens signed in: open the `RER_OPEN` URL it
prints on this computer (it carries this checkout's dev key, so treat it as a
credential). Use `rer dev --as` to switch between the owner, signed out and the personas
`admin@dev.localhost` and `member@dev.localhost`; `dev --as PERSONA` starts as one of
them or `signed-out`. `dev --login` aliases automatic owner sign-in; open its
`RER_OPEN` URL. Finish
first-run details at `/setup`. Stop serving
with `rer dev --stop` before verify, reset or data movement. Export
before resetting data you want to keep. Deploy without `--dry-run` only when the
owner explicitly requests it and supplies the declared account configuration.

This repo develops a **seed**: a complete, refined, self-hostable product that buyers install, customise with their own agents, and receive updates for. The requirements below describe the release target; check `HANDOVER.md`, `seed.json`, and `package.json` for current implementation and available commands.

Read `CONTRACT.md` first. `AGENTS.consumer.md` supplies owner guidance where the actual distribution uses it; this file governs author work.

## Rules

- Calibrate against current demonstrated agent capability and observed runs. Expect capable agents to implement and maintain complex systems; code size and customisation do not by themselves imply a human maintenance burden, and a merge conflict is work for the owner's agent, not evidence of one. The agent chooses how upstream changes come in; the outcome is what is verified. Diagnose instructions, context, model choice, and tooling before declaring a capability limit. Optimise accepted-change cost while preserving owner intent, and revise expectations as the frontier advances.
- No mock code or fallbacks in production paths. Fail loudly naming what is missing. Mocks live in tests.
- Remove dead code. No flags to hide it. A shim that carries a released extension contract across a version is the one exception, and it names the version that removes it.
- Small, decoupled files. Split before adding.
- Parallelise independent work. Migrations and ordered writes are not independent.
- A wrong LLM output is an instruction, schema, or normalisation bug. Fix that; never add a semantic fallback. Retry only transient transport failures, with bounds.
- Verify with the actual repository checks and exercise affected journeys on the real local runtime or an authorized preview. Record uncovered checks and distinguish local evidence from deployment.
- Reuse maintained implementations where they save work; introduce or replace boundaries for concrete product needs.

## Ownership and integration

This checkout owns its tracked product inputs. Core, extension and migration
folders are conventions, not separate ownership or update boundaries. Owners and
their agents may change any source, core logic, schema, UI or infrastructure.
Choose any integration method, including merge, reapplication or rewrite, and
verify the resulting product against recorded owner requirements. Preserve all
customisations and applied migration history; never regenerate over owner work.
Deep divergence can still adopt or adapt later shared improvements.

## Maintained stack

The following stack is the maintained starting path, adaptable by an owner or fork. Preserve applicable requirements when changing it.

One Cloudflare Worker serves Hono HTTP surfaces and the React documents and
operator app; a second needs a concrete isolation, security, or scaling reason.
TypeScript, Hono + Hono RPC, Vite + React + TanStack Start (with TanStack Router
beneath it), shadcn/ui + Tailwind, Drizzle on D1.

## Rendering ownership

TanStack Start serves React documents. [Document rendering](docs/document-rendering.md) describes the dispatch
boundary and local-workerd checks. Preserve native auth, product and baseline
contracts, declared Hono HTTP families, existing data and applied migration
history, and the custom Worker entry’s event and named exports. Hono dispatches
only explicit HTTP families before Start; Start owns React documents and generated
`/_serverFn/` transport. Verify native documents and generated functions
independently on the emitted local Worker; a build alone does not prove acceptance.

The current URL convention is: `/` is the deployment's public landing — the owner's front door, or the product's own public surface where it has one — the operator app lives under `/app` behind a session, and sign-in is at `/signin`. Every sessionless path is declared in `seed.json → deploy.publicPaths`.

D1 for data, R2 for files, Queues for jobs, Cron for schedules, Workflows for multi-step retriable orchestration, Durable Objects for suitable coordination or realtime needs, KV as cache. Preserve authoritative-data and durability requirements when adapting these choices. Handlers are stateless; in-memory state is cache only. Web-standard APIs over Node.

## Source layout

Inspect the actual source and scripts before changing the product. `src/core/`,
`src/ext/`, platform adapters, feature APIs and separate migration directories are
useful existing conventions, not protected ownership boundaries. Keep cohesive
responsibilities and small files. Owners may change imports, APIs, core schema,
framework and infrastructure; update affected integration and verification together.
Keep server dependencies and secrets out of browser bundles.

Shared source can be substantial, optional and maintained in an edition, family,
Base or independent repository. A complete tested combination should save
implementation and adaptation effort. Share useful edition mechanisms and tests,
then verify real adoption and meaningful variation in other products.

## Contract and manifest

`BASELINE.md` records shared security, privacy and operational requirements;
`CONTRACT.md` records product behavior; `seed.json` describes the product using
its actual schema. Read recorded owner intent wherever this repository keeps it.
All these files are editable. Deliberate changes identify affected clause IDs,
explain the replacement requirement and security consequences, and retain tests
for the owner's intended result. Do not weaken a guarantee silently. Shared
requirements may be maintained with the implementation that owns them; identical
wording alone does not require promotion into Base.

Keep stable clause IDs, never reuse published IDs, and reserve `BASE-` for baseline
clauses. Add tagged tests for observable requirements, including replacements or
supersessions. Use the contract helpers and reporting this edition implements;
a shared pack, override registry or automatic supersession report is not assumed.
Distinguish satisfied, intentionally changed, broken and uncovered requirements;
an untested clause is not evidence. Record meaning changes by ID in release
metadata using its actual schema.

Declare capabilities, non-goals, externals, environment, health/public paths,
supported extension points, accessibility and operating costs truthfully. Keep
capacity and rate limits in the implemented manifest fields and feature latency
in its clause; distinguish tested measurements from targets or estimates. Do not
claim catalog, CLI or harness behavior that the current implementation lacks.

## Data and logic

- The current repository/service/route split keeps persistence and policy inspectable. Adapt that structure coherently when useful; validate inputs at trust boundaries and keep authorization server-side.
- Events are facts. Jobs are commands.
- Operations are semantic (`archiveConversation`, `requestAiDraft`). Runtime validation at every trust boundary.
- Every entity has `id` (ULID), `createdAt`, `updatedAt`. Custom fields are enabled per entity in `seed.json`. Sidecar tables and new core columns are both available; choose the model that serves the product and verify migration of existing data.
- Preserve already-applied migration history. Destructive changes are expand → migrate → contract with a recovery step.
- Queue consumers and webhook handlers are idempotent. Failed jobs are never swallowed.

## Platform, extension and configuration

Platform adapters are a useful way to isolate bindings and external services.
Choose owned primitives or hosted dependencies for the actual requirements and
operating cost; declare new externals and preserve privacy, access and secret
boundaries. Native sessions are the maintained default. No telemetry, phone-home
or kill switch.

Contributions, policies, events, UI slots and adapters can simplify recurring
changes, but have no quotas or mandatory framework. Their presence does not limit
core edits. Version supported public extension contracts and document breaking
changes; owners may change internal APIs and integration together. Runtime plugin
machinery is an implementation choice requiring a real use and appropriate trust
boundaries, not a universal requirement or prohibition. State lint guarantees only
when the actual lint configuration enforces them.

Keep secrets out of tracked source and client bundles. Owner configuration and
infrastructure source may live wherever useful; preserve real installation values
when updating. Required configuration must fail visibly naming what is missing.
Provision resources idempotently by deterministic identity where supported; verify
find-or-create behavior and preservation of existing resources before claiming it.

## Commands and verification

Use README.md and actual package scripts for installation, local development,
verification, provisioning, deployment and data export/restore. Do not infer
provisioning from `rer setup`, automatic deployment from a push, previews from a
PR, or account-free operation from a command name. Run only implemented commands
within session authority and record missing release capabilities in HANDOVER.md.

Verify affected contract and baseline requirements, types/build, migration from
existing data, and real application journeys using the available checks. Test
portable export and restoration before claiming them. A clean clone and Base
checks alone do not establish the whole product contract. Record test gaps,
failed attempts and local versus deployed evidence explicitly.

## Releasing

Keep contract changes and tagged tests aligned with behavior. Preserve applied
migration history and verify forward migration and recovery for schema changes.
Use the actual RELEASE.json schema to record clause changes, extension changes,
migrations, breaking changes and instructions for updating agents.

Verify the complete candidate, including intentional source, schema, UI and
infrastructure divergence, against recorded owner intent. Refresh key screenshots
in `visual/` when appropriate. Describe clean-clone startup and the actual
distribution process accurately; do not assume a release harness, verified-tag
filter, consumer-guide replacement or publish command exists. If the distribution
ships AGENTS.consumer.md as AGENTS.md, check the emitted guide against actual
paths, commands and readiness. Preserve the author repository and owner forks.
Commit, tag, publish and deploy only within session authority. Parked work remains
parked until explicitly resumed.
