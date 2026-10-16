# Resolve an uncertain external action

Settings → Connections → Review external outcomes displays the original uncertain
attempt and retained human decisions. Only a persisted Unknown outcome may be
resolved; a call still marked Dispatching must first reach a known or Unknown result. An authorized human records Done or Not done,
a supporting narrative, a traceable evidence reference, and an optional evidence
file through the existing private upload control. The verified file remains linked
from the retained receipt after reload and is downloaded through the existing
authorized file route. Text-only evidence remains available for verbal or support
confirmations. External reference text is never fetched or treated as independently
verified by Cradle.

The mounted command is `POST /api/v1/commands/attempt.resolve`. Its strict input is
`{attemptId, expectedVersion, outcome: "done" | "not_done", evidence: {summary, reference, fileId?}}`
inside the usual command envelope. Actor and time come from the authenticated
session and server clock. Clients cannot supply either. The receipt carries
`reconciliationMethod: "human_evidence"`, the evidence, actor/time, and original
effect identity (attempt, run, command, provider, connection, input hash, provider
key, original external ID and first possible effect time). An attached file also
records its verified SHA-256 and `evidenceFileId`.

Current policy must allow `attempt.resolve` on the run metadata entity
`01K00000000000000000000503` for that specific run. This requires a human session,
not a machine credential. Reading additionally requires existing `execution.read`
and `connection.read` rights. Installation roles confer no implicit permission;
existing default policies are unchanged. File attachment additionally requires
current private-source staging/upload/read policy. Only an available file in the
same app, in the submitting operator's active source staging record, can be
attached. Foreign, missing, erased, unfinished and inaccessible IDs receive the
same refusal. File version, checksum, owner, source state and current policy are
fenced in the resolution commit. Attachment adds no file-read grant to other
viewers of the run; the existing private download policy remains authoritative. The integration fixture installs explicit
persisted operator/viewer policies and exercises the real policy engine and Base
session flow. It does not claim to test a policy administration UI.

Exact command replay returns the original receipt after rechecking authority.
Changed input, stale attempt versions, concurrent losing decisions and any attempt
to replace a decision are refused. The atomic admission includes settlement and
associated observations. Delayed provider results append observations but cannot
replace the human receipt or settle its reservation again. Provider webhooks retain
their event observation without changing the human outcome. Done is terminal;
Not done is a known failure. Queue redelivery, recovery, scheduled processing and
restart cannot resend either. The existing original-key retry is refused for human
resolutions; any later effect needs a separate authorized command and audit history.

Run `node --import ./tests/helpers/typescript-loader.mjs --test tests/execution-resolution.mjs`
for targeted service and real command-route proofs. After building the real Worker,
run `node --import ./tests/helpers/typescript-loader.mjs tests/ui-execution-resolution-browser.mjs`.
`CRADLE_RESOLUTION_EVIDENCE` selects the private screenshot/route-proof destination
(default `test-results/execution-resolution`). The browser journey uploads a real text file using mounted source/upload routes,
attaches it through the resolution form, downloads identical bytes after reload,
and checks viewer denial. Tests use no live providers.
