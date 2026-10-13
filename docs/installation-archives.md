# Installation archives

Use the public `rer export` and `rer import` commands described in RUN-LOCALLY.md.
The maintained Base portability module owns the archive format, bounded streaming,
checksums, atomic D1 restore and R2 object custody. Cradle supplies its real DB/FILES
bindings and operational data policy. All ordered migration groups are applied.
Write archives beneath the protected `exports/` directory, for example
`--output exports/workspace.rer`; the public CLI enforces this output location.

Business records, schema, views, forms, source originals, attribution, audits and
history retain their IDs. FILES bytes and metadata transfer. Launch search is derived
and rebuilt from the existing SQL projection. Manual record tables and retained
schema revisions are reconstructed by Cradle's admitted schema compiler before
Base restores their cells. Their search indexes are rebuilt from those cells.
Archive SQL is never executed as a schema-authoring input. Work queue deliveries, Durable Object
initialization caches and local logs do not transfer.

Base/native sessions, one-use sign-in tokens, machine credentials, private provider
credentials, OAuth handshakes, development mail, admission wakes, active transfer
bookkeeping and temporary importer staging do not transfer. Contractor credential
records are business evidence and do transfer. Sealed execution inputs are omitted.
Connections need configuration; grants are held; automation definitions are disabled;
queued work is cancelled. API keys, signed admission ledgers, sealed destination credentials and live delegation bindings do not transfer. User automation credential references are cleared and pending captured events are completed without dispatch. Queued integration deliveries are rejected and in-flight deliveries become uncertain. Possible external effects remain Unknown and are never
silently retried. Historical imports retain their plan, originals and provenance and
require explicit continuation after restore.

Import requires explicit confirmation and an empty target. Only actual migration
bootstrap rows are replaceable. A populated installation is refused. Private settings
and hosting credentials are supplied separately. After import, run setup with your
owner email and use the ordinary Base sign-in. Fresh admission transfers the archived
installation owner's exact application permissions and current manual-base control.
It preserves historical actor IDs, row ownership, policy records and other users'
inactive memberships. Reinvitations and renewed automation approvals are explicit.

Remote installation archives are not exposed by this CLI adapter. Hosted API exports,
CSV and base JSON have their own documented scopes; see leaving-cradle.md.

Each available evidence file carries its byte count and SHA-256 in D1. Export
compares those values with the actual stored bytes; a mismatch refuses the archive
and identifies the file ID. Import checks both the transport checksums and the
staged evidence row's expected checksum before committing any business data.
Execution ciphertext is omitted from installation archives. Ordinary file upload,
private execution storage, archive copying and restore copying supply a checksum
to R2; private writes and final restore copies also verify the resulting bytes.
Existing evidence rows already required SHA-256 in migration 0400; existing
execution references already contained the digest calculated from the stored
ciphertext. No applied migration is rewritten or checksum invented from a filename.

The owner erases a removed person in Settings → People and authority → Erase
identity. Remove access first; active campaign ownership or an unresolved assigned
decision blocks removal. The confirmation states that erasure cannot be undone.
The response and retained receipt distinguish anonymisation from completed file
deletion. A pending receipt can be checked again; the scheduled handler continues
its bounded file cleanup. Completion is only reported after every listed blob is
absent. Comments, campaign activity and decision outcomes remain attributed to the
stable anonymous person; notifications and delivery records are deleted.

Erasure touches only the person's identity places, listed in
`src/domains/lifecycle/member-identity-places.ts` and returned as the receipt's
`plan`: their operator and Base sign-in rows (whole values replaced), rows that
reference them by id or are attributed to them (author, owner, assignee, requester,
actor, mentions and admission records naming them; whole-token rewrites only), their
notifications, preferences and the development mail addressed to them (deleted).
R2 objects are deleted only through an exact link: captured inputs of their runs and
files in their own private source intake that carry their identity as a whole token.

Before any mutation, a literal scan of every physical text/BLOB column, JSON value
and key, and every R2 key, metadata and UTF-8-decoded body finds each other copy of
the name or email. A copy inside a longer word (`Mark` in `Marketing`), inside
another person's name (`Jo Lee` in `Jo Leeds`) or in content not attributed to the
person refuses with 409, naming each store and reason in `erasureCopies`; nothing is
rewritten or deleted. The owner edits those copies, or confirms that they are not
this person's identity (`keepCopies` lists the confirmed stores) and the copies stay
byte-for-byte unchanged. In a confirmed attributed row only whole-token occurrences
are rewritten. Derived search follows its source triggers. Ambiguous shared identities, JSON-key collisions, non-string identities,
noncanonical JSON escapes that cannot be safely replaced, protected identifiers, versioned operation-case custody,
and retained import/archive/source-version or signed construction/release custody still refuse before any identity mutation.
These holds remain unresolved erasure work;
they are not successful erasures. Transformed or paraphrased identity and copies
already downloaded or delivered outside the installation are not discoverable by
literal matching.

Binary-custody refusal applies when a matching D1 value is not stored as text.
The R2 scan does not decompress files, parse media formats or decode arbitrary
encodings. Identity inside compressed PDFs or other encoded binary content can
remain undiscovered. Erasure of those copies remains unproven; a completed receipt
does not establish universal erasure of such content.

Campaign deletion requires the exact campaign code. Canonical children cascade;
the seed adapter explicitly clears imported source references, evidence files,
analyses, retained undo/sample snapshots, captured execution inputs, event/result
copies and related notification deliveries. The audit survives with an anonymous
campaign reference. Construction dataset/runner custody blocks deletion until that
custody is explicitly cleared. No external runner or provider is contacted by this
local cleanup path.

Post-erasure archives retain the anonymous identity and `erased` state. The
existing record-erasure restore adapter retains its re-erasure semantics. Adopting
the shared erasure helper and choosing its old-archive refusal fence versus that
seed policy remains an owner decision. The refreshed Base auth/schema retains
this existing seed policy. A pre-erasure archive restored to a new store without a later erasure journal cannot
be recognised as stale. Raw database imports also bypass product safeguards.

Recovery rehearsal (run from a disposable installation, with serving stopped). Set `PORT` to its configured local port; `answers.json` contains the returning owner email. The truncated import is expected to exit 1; continue with the original archive:

```sh
rer dev --stop --json
rer export --output exports/first.rer --non-interactive --json
rer reset --yes --non-interactive --json
pnpm run db:migrate:local
node --input-type=module -e "import {readFile,writeFile} from 'node:fs/promises'; await writeFile('truncated.rer',(await readFile('exports/first.rer','utf8')).split('\n').slice(0,-2).join('\n')+'\n',{mode:0o600})"
rer import --input truncated.rer --yes --non-interactive --json
rer import --input exports/first.rer --yes --non-interactive --json
rer setup --answers answers.json --port "$PORT" --non-interactive --json
rer dev --login --non-interactive --json
```

`truncated.rer` is a scratch copy of `exports/first.rer` with its closing line removed.
While the final dev command is serving, run `rer outbox --json` in a second terminal. Keep the outbox and one-use sign-in link private.
The first import must refuse and leave the empty target unchanged. The second
imports the original complete archive. Open the newly printed outbox, sign in as
the installation owner, and edit a restored record. The targeted
`tests/rer-data-roundtrip.mjs` journey performs these same command steps, verifies
all archived table cells and file metadata, and exercises the fresh owner session.
Local evidence does not establish hosted D1/R2 performance or remote recovery.

Audit and history have no age-based pruning in the current implementation:

| Stores | Retention and explicit exceptions |
| --- | --- |
| `admission_audit`, `command_admissions`, `admission_events`, provenance segments, outbox | Retained; explicit erasure removes personal payload/reference copies while retaining action history. |
| Campaign `activity_entries`, `comments`, decision outcomes | Retained with anonymous authors; campaign deletion removes that campaign's activity view and children. |
| `automation_runs`, launch action history, record automation versions/events | Retained; restore holds/cancels execution rather than pruning history. |
| Evidence versions, nodes, claims, comments, contexts and erasure receipts | Retained; explicit privacy erasure clears content/dependencies and deletes the listed bytes. |
| Execution runs, attempts, receipts and model calls | Retained. `0502_auth_payload_retention.sql` only adds `reconcile_input`; it defines no expiry or sweeper. Explicit erasure clears sealed and reconcile inputs. |
| Operation case history/recovery reviews, knowledge fact revisions | Retained; explicit source erasure invalidates dependent content. |
| Channel events/deliveries, integration delivery attempts/resolutions/replays | Retained; person erasure deletes their notifications/deliveries. External delivery history is not silently retried after restore. |
| Import jobs, reports, originals, mapping and provenance | Retained after completion/undo; source custody must be explicitly resolved before an erasure can claim completion. |
| Repair visits, completion claims, acceptances, handoffs and business decisions | Retained as outcomes; no general expiry task. |
| Lens history, bulk-undo snapshots, analyses, construction/release evidence | Retained; validity deadlines are not automatic deletion. Campaign deletion removes its matching undo/source copies. |

Scheduled jobs deliver notifications, continue configured provider/automation work,
and finish requested erasures. They do not prune audit/history by age. Temporary
admission assertions and completed erasure blob-work rows are deleted only after
their transaction or verified cleanup finishes; durable receipts survive.

Concurrent R2 writes reserve durable custody before writing. Erasure refuses while a reservation exists, and an old request cannot reserve after a newer erasure completes. Evidence publication releases its reservation atomically with admission; execution does so when its attempt becomes durable. Archive and restore copying release on their corresponding durable progress/commit. An interrupted writer keeps its reservation: stop and investigate that writer, verify or remove its bytes, and resolve its custody before retrying erasure. Reservations are never silently expired.

Migration 9025 preserves existing search rows and adds an indexed map from record identity to FTS row ID. Restore rebuilds the same logical search projection using that retained map. No grant or membership is added by 9023, 9024 or 9025.

The `launch.comment.create` command is included in new explicit launch operator setup. Existing persisted policies are preserved: the owner must explicitly add this action on the campaign entity for an older policy to use the new command. Row, field, current-session and explicit-deny rules still apply. No update silently appends it to stored policies or grants.
