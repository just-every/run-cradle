# Installation archives

As the installation owner, open Settings → **Export your installation**, choose
**Prepare archive**, and keep the page open while it prepares the archive. When
it says the archive is prepared and verified, choose **Download verified archive**.
If preparation stops with an error, correct the reported problem and use
**Continue preparing archive**, or prepare a new archive if the job was aborted.
The download is a private `cradle-installation-….rer` file containing installation
data and files in the same format as `rer export`.

Keep your source checkout, customisations and private deployment configuration
separately. The `.rer` file is a data archive, not a source-code bundle. Uploaded
source originals stored as business records can be included; that does not replace
the application checkout needed to run them.

## Restore an archive

To restore a Settings download, use an empty checkout of the matching Cradle
source. Copy the downloaded file into that checkout as `exports/workspace.rer`,
then run:

```sh
rer install
rer import --input exports/workspace.rer --yes
rer dev
```

Do not start dev in the destination before import: it must be empty. For an
existing local installation, stop dev/preview, save any data you need, and run
`rer reset --yes` before import. `rer dev` recreates local configuration and the
local owner; no `answers.json` is required. To choose the returning owner email,
run `rer setup --owner-email you@example.com` after import and before dev.
Review imported access, reconnect private services and approve held automations
before using them. `rer doctor` may exit 3 for local configuration missing before
that first dev launch; this alone does not show that archive import failed.

The public `rer export` and `rer import` commands are also described in
[Run it locally](../RUN-LOCALLY.md). Archives are streamed with checksums and
restored in one step, so a failed restore leaves the empty target unchanged.
Write command-line archives beneath the protected `exports/` directory, for
example `--output exports/workspace.rer`, or to a private path outside the checkout.

The Settings download works from the signed-in installation, including a hosted
one. `rer import` restores into local storage; it does not restore directly into
hosted resources. Import asks for your confirmation and needs an empty target. A
populated installation is refused. Private settings and hosting credentials are
supplied separately. CSV and base JSON have their own documented scopes; see
[leaving Cradle](leaving-cradle.md).

## What an archive holds

Business records, schema, views, forms, source originals, attribution, audit
records and history keep their IDs. Files and their details transfer. Search is
rebuilt from the restored records, and tables you built in Records are rebuilt
from their schema with their search indexes.

An archive does not carry sign-in sessions, one-use sign-in links, API keys and
other machine credentials, private provider credentials and sign-ins in progress,
local development mail, work waiting in queues, or temporary import staging.
Contractor credential records are business evidence and do transfer. Sealed
execution inputs are left out.

Each stored file carries its size and SHA-256 checksum. Export compares them with
the stored bytes; a mismatch refuses the archive and names the file. Import checks
the transfer checksums and each file's expected checksum before it commits any
business data.

## After a restore

- Connections need to be set up again, and grants are held until you approve them.
- Automations come back disabled and queued work is cancelled. Automation
  credential references are cleared, and events still waiting to be sent are
  completed without sending.
- Queued integration deliveries are rejected and deliveries that were in flight
  become uncertain. Their possible effects on other systems stay Unknown and are
  never retried silently.
- Past imports keep their plan, originals and source; continuing one needs your
  explicit go-ahead.
- The installation owner in the archive is admitted again with the same
  application permissions and control of manual bases. Historical actors, row
  ownership, policy records and other people's inactive memberships are kept.
  Re-inviting people and renewing automation approvals are explicit steps.

## Erase a person

Open Settings → People and authority → **Erase identity**. Remove the person's
access first; active campaign ownership or an unresolved assigned decision blocks
removal. The confirmation states that erasure cannot be undone. The result and
its receipt say separately whether the person was anonymised and whether their
files are fully deleted. A pending receipt can be checked again, and a scheduled
job continues the file cleanup. Completion is reported only after every listed
file is gone. Comments, campaign activity and decision outcomes stay attributed
to the same anonymous person; notifications and delivery records are deleted.

Erasure touches only the person's own identity places: their sign-in rows, items
that reference them (author, owner, assignee, requester, actor, mentions and
admission records naming them), their notifications and preferences, and the
development mail addressed to them. Files are deleted only when they are exactly
linked to the person: captured inputs of their runs and files in their own private
source intake that carry their identity.

Before changing anything, Cradle scans every text value and stored file for any
other copy of the name or email. A copy inside a longer word (`Mark` in
`Marketing`), inside another person's name (`Jo Lee` in `Jo Leeds`) or in content
not attributed to the person stops the erasure with a conflict that names each
place and reason; nothing is rewritten or deleted. You can edit those copies, or
confirm that they are not this person's identity, and then they stay exactly as
they are. In a confirmed attributed row only whole-word occurrences are rewritten.

Some cases still stop an erasure before any change: ambiguous shared identities,
values that cannot be safely replaced, protected identifiers, operation-case
custody, and import, archive or source-version custody that is still held. These
stay unresolved erasure work and are never reported as successful erasures.
Rewritten or paraphrased identity, and copies already downloaded or delivered
outside the installation, cannot be found by matching text. Inside compressed PDFs
and other encoded files, a copy of the identity can remain undiscovered, so a
completed receipt does not prove that such content is clear.

Erasure waits while a file is still being written. An interrupted write keeps its
hold until you stop and investigate it, verify or remove its bytes and resolve
the hold before retrying; holds never expire silently.

## Delete a campaign

Campaign deletion asks for the exact campaign code. Its records are deleted with
it, and its imported source references, evidence files, analyses, undo snapshots,
captured execution inputs, event copies and notification deliveries are cleared.
The audit survives with an anonymous campaign reference. Construction dataset and
runner custody blocks deletion until you clear it. Nothing outside the
installation is contacted.

Archives made after an erasure keep the anonymous identity and its erased state.
An archive made before an erasure and restored into a new installation cannot be
recognised as out of date, so check it for anyone you have erased since. Raw
database imports bypass the product's safeguards.

## Recovery rehearsal

Run this from a disposable installation with serving stopped. Set `PORT` to its
configured local port. The truncated import is expected to exit 1; continue with
the original archive:

```sh
rer dev --stop --json
rer export --output exports/first.rer --non-interactive --json
rer reset --yes --non-interactive --json
pnpm run db:migrate:local
node --input-type=module -e "import {readFile,writeFile} from 'node:fs/promises'; await writeFile('truncated.rer',(await readFile('exports/first.rer','utf8')).split('\n').slice(0,-2).join('\n')+'\n',{mode:0o600})"
rer import --input truncated.rer --yes --non-interactive --json
rer import --input exports/first.rer --yes --non-interactive --json
rer setup --owner-email you@example.com --port "$PORT" --non-interactive --json
rer dev --non-interactive --json
```

`truncated.rer` is a scratch copy of `exports/first.rer` with its closing line
removed. Open the final dev command's private `openUrl` from its ready event; it
signs in the configured local owner. No local mail viewer or printed email
sign-in link is needed. The first import must refuse and leave the empty target
unchanged. The second imports the original complete archive. Edit a restored
record as the installation owner to confirm it works.

This rehearsal runs on your computer. It says nothing about the speed of hosted
storage or about recovering a hosted installation.

## How long history is kept

Audit and history are not pruned by age. Scheduled jobs deliver notifications,
continue provider and automation work, and finish requested erasures; they never
delete history because it is old.

| What | How it is kept |
| --- | --- |
| Admission and change audit records, events and the outbox | Kept. Erasing a person removes personal details while keeping the action history. |
| Campaign activity, comments and decision outcomes | Kept with anonymous authors. Deleting a campaign removes its activity and children. |
| Automation runs, Launch action history and record automation versions | Kept. A restore holds or cancels execution rather than pruning history. |
| Evidence versions, claims, comments and erasure receipts | Kept. Privacy erasure clears content and deletes the listed files. |
| Execution runs, attempts, receipts and model calls | Kept; nothing expires them. Erasure clears their sealed inputs. |
| Operation case history, recovery reviews and knowledge fact revisions | Kept. Erasing a source invalidates content that depends on it. |
| Channel events and deliveries, integration delivery attempts and replays | Kept. Erasing a person deletes their notifications and deliveries. External delivery history is never retried silently after a restore. |
| Import jobs, reports, originals, mappings and provenance | Kept after completion or undo. Custody of the source must be resolved before an erasure can report completion. |
| Repair visits, completion claims, acceptances, handoffs and business decisions | Kept as outcomes; nothing expires them. |
| Lens history, undo snapshots, analyses, construction and release evidence | Kept; a validity deadline does not delete anything. Deleting a campaign removes its undo and source copies. |

Temporary admission records and finished erasure file-cleanup work are deleted
once their work completes; the receipts stay.

Search results are preserved across upgrades and rebuilt on restore. No upgrade
adds a grant or membership.

The Launch comment action is part of every new Launch operator setup. A policy
you already saved keeps exactly what it had: to let an older policy comment, add
the action on the campaign entity yourself. Row, field, current-session and
explicit-deny rules still apply, and nothing is added to saved policies or grants
automatically.
