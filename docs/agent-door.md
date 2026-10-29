# Cradle company-agent door

The operations app steward serves one shared Base agent door at `/mcp`, its canonical OAuth resource
metadata, `/api/rer/agent-policy`, `/agents` and the Agents person/approval doors.
It negotiates MCP `2026-07-28` and `2025-11-25`. March 2025 is refused. Native
REST, session, Origin, CSRF, device and installation credentials keep their own
purposes. The former proposal-only MCP dispatcher is removed.

The installed CLI and recorded door runtime use rer 0.2.87, Base
`62f07fe6ecfdeae1a90bf6e65a02abae288996b3`. Business settings and the door's
private theme/icon dependencies use that same source revision. The public
homepage, marketing and navigation copies retain their existing pins and bytes.

## Synchronous capability set

This rollout covers tools, signed policy, pause, audit and idempotency. Current
native principal authorization and owner-bound Business tokens apply throughout.
The release has no capability-declaration field; `agent-surface.json` declares
only the integrated registry and its real native fixtures.

Agents can inspect currently authorized bases, schemas, rows, record history,
views, forms and AI usage. Private content is conservatively classified sensitive.
The native Launch projection also exposes campaigns, decisions, activity and
the sponsor's inbox, while native app operations expose authorized retained
cases and mandates. Attachment inspection returns native metadata; its bytes
keep their existing native content door. Native audit reads retain current
field and source projection. Full Launch projections retain their ordinary
all-Launch authority check; restricted sponsors use the masked records tools.
View revision witnesses return only authorized identifiers and versions. Resource
reads use those same native services, row predicates and field projections.
Hidden and absent resources have the same refusal. Imported text is untrusted.

`cradle.views.save` creates or updates a private, unlocked, non-shipped view
through native `view.save` admission. Existing views require their actual version;
callers may also supply the door's `expected_revision`. It changes no records,
grants, shared/public visibility or delivery. The server summarizes the exact
native view and records its target. No provider cost or invented Undo is exposed.

An existing proposing key retains its original base and issuer fences through
`cradle.schema.read`, `.propose`, `.proposals`, `.proposal` and `.withdraw`.
These tools call the same native services as the proposal REST face. Proposal
text and private schema content receive the same conservative sensitive class. They cannot
adopt, read record values, administer keys or send to providers. Business tokens
cannot impersonate a proposing key. The signed-in owner must answer company-agent
policy before a local key acts. Discovery is the shared registry; possessing a
key does not grant the scopes advertised there.

## Native identity and attribution

Business `owner_id` maps to the current native installation owner.
Business team ids map through signed `bs_team` bindings and
`cradle_base_operators` to `authority_principals.id`. Token email never selects a
person. Current native account status and `AUTH_ALLOW_LIST` govern both native
and agent admission. Unknown, inactive and excluded sponsors are refused.
Business policy roles remain separate from native application roles: a local
promotion does not create Business editor authority.

The door bridge enters the existing native policy engine with an internal
admission capability; it creates no session or credential. Native transaction
guards recheck the sponsor, original local credential, policy snapshot and
revocation. Native command admission atomically retains `<agent> for <person>`,
operation identity and named approvers in `cradle_agent_activity`; native record
history exposes that attribution separately from its existing actor.

## Undeclared families and limits

Queued lifecycle is undeclared. Record writes can capture automations, calendar
work and change deliveries; Launch writes can enqueue notifications and event
work. Provider sends, AI/model work, retries, scheduled imports/exports, webhook
and Slack deliveries, calendar synchronization and operational/repair execution
remain on their existing native doors. Synchronous persistence alone does not
establish a synchronous agent effect.

Seed-emitted events beyond the built-in `cradle.events.list`, subscriptions,
multi-sponsor admission, mail edges, resource refresh, timed lifecycle, dual host
and owner-native administration are undeclared. Schema adoption, import commit,
people/grants/keys/settings administration, snapshots, trash recovery and erasure
retain their current human proof and native authority. No substitute queue,
consent store or verification-only production route is added.

Base retains pending arguments, outcomes, summaries, trace and audit without a
client-scoped erasure contract. Native member/campaign erasure therefore refuses
while agent custody exists, before changing native data. This explicit custody
exception remains closed; deleting a native record cannot erase or authorize
replay of a retained door outcome. Spend caps are not enforced by this release;
the conformance journey declares `spend: {none: true}`.

## Verification and contract boundary

`agent-surface.json` contains the exact tool/resource registry and its journey.
Its disposable initializer proves raw setup-token refusal, the real signed
owner claim, replay refusal and the resulting native session. Every phase
prepares fresh data and proposing credentials through ordinary native HTTP doors.
The supplemental native journey asserts one created view, same-key replay,
changed-argument conflict, stale native revision, separate agent/sponsor attribution
and local Pause against that same native persistence and audited tool helper.
No SQL, production test route or substituted auth adapter prepares fixtures.
Registered tools make no outbound provider request, so no network edge is declared.

Run `pnpm exec rer door clauses --write`, then `--check`, and the normal
`pnpm exec rer verify`. The legacy contract currently lacks its standard
Lander-Regenerate contract generator. The released clause command refuses;
canonical BASE-AGENT rows and generated acceptance/status changes must wait for
that source conversion. The static verifier consequently reports the missing
built-in event clause. This is a reported gap, not a passing conformance claim.
Undeclared-family clauses must remain partial when their agent acceptance needs
one of those families; existing native person-flow evidence is not agent evidence.

## Discoverable native jobs

The door currently registers 25 tools. Policy still governs reads.
`cradle:read` never grants native base, row or field access. A proposing key
retains only its two original schema scopes.

| Tool | Native effect | Scope |
| --- | --- | --- |
| `cradle.activity.read` | Read | `cradle:read` |
| `cradle.audit.query` | Read | `cradle:read` |
| `cradle.bases.list` | Read | `cradle:read` |
| `cradle.campaigns.query` | Read | `cradle:read` |
| `cradle.campaigns.read` | Read | `cradle:read` |
| `cradle.decisions.read` | Read | `cradle:read` |
| `cradle.events.list` | Read | `events:read` |
| `cradle.files.read` | Read | `cradle:read` |
| `cradle.forms.read` | Read | `cradle:read` |
| `cradle.notifications.read` | Read | `cradle:read` |
| `cradle.operations.observe` | Read | `cradle:read` |
| `cradle.records.history` | Read | `cradle:read` |
| `cradle.records.query` | Read | `cradle:read` |
| `cradle.records.read` | Read | `cradle:read` |
| `cradle.schema.inspect` | Read | `cradle:read` |
| `cradle.schema.proposal` | Read | `schema:read` |
| `cradle.schema.proposals` | Read | `schema:read` |
| `cradle.schema.propose` | Inert proposal write | `schema:propose` |
| `cradle.schema.read` | Read | `schema:read` |
| `cradle.schema.withdraw` | Inert proposal write | `schema:propose` |
| `cradle.usage.read` | Read | `cradle:read` |
| `cradle.views.list` | Read | `cradle:read` |
| `cradle.views.read` | Read | `cradle:read` |
| `cradle.views.revisions` | Read | `cradle:read` |
| `cradle.views.save` | Private view write | `cradle:write` |

The eight resource templates are:

- `cradle://bases/{base}`
- `cradle://bases/{base}/schema`
- `cradle://bases/{base}/tables/{table}/records/{record}`
- `cradle://campaigns/{campaign}`
- `cradle://decisions/{decision}`
- `cradle://forms/{form}`
- `cradle://proposals/{proposal}`
- `cradle://views/{view}`

The file tool returns metadata, the history tool reads history, and the view
write is limited to private definitions. None advertises file downloads, record
restoration, public sharing, schema adoption or scheduled execution.
