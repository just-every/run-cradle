# Independent source research return

Read-only helper /root/custody_research, gpt-6-luna, max reasoning. No edits, tests, clones, credentials or pushes. This was mechanism research, not an independent acceptance gate or review of the parent's implementation.

Base has no public snapshot-compaction hook. Cradle can wrap hosted export advancement in src/domains/portability/installation-http.server.ts and compact after completion. Base verifies all parts before marking an export complete; downloads then read only job metadata and parts, so removing just redundant snapshot tables preserves the archive. Base's CLI already aborts completed exports after downloading and verifying them.

A legacy transition can stream completed exports through Base's readArchive verifier, then remove only exact snapshot and metadata tables recorded for that job. Keep it idempotent and separate from erasure. The existing Base erasure hook broadly drops all snapshot and staging tables and deletes jobs and parts in its atomic batch; Cradle mirrors that contract in src/domains/lifecycle/portability-custody.server.ts.

Job-delete triggers and rer_portability_ storage stay outside Base archive schema and manifest checks. Main risks are stale triggers after Base abort drops copies, preflight binding writes that violate data-preserving preparation, and local CLI exports bypassing the hosted route. Keep the direct-drop path for orphaned snapshots. If triggers clear rows, collect only empty unaddressable tables after atomic erasure succeeds. Base sources: modules/portability/index.mjs, export.mjs, storage.mjs, copies.mjs, bookkeeping.mjs, catalogue.mjs and journal.mjs in the pinned @runeditrun/rer 0.2.80 package.

Cradle's product import previews are separate. Record erasure clears every row in each affected preview within the admission mutations, and reads refuse the erased preview: src/domains/evidence/erasure.server.ts and src/domains/portability/import.server.ts. This behavior must remain intact.

Parent implementation handles the reported risks with schema-only exact-owner registration, trigger-definition/inventory guards, reconciled already-aborted copies, facade abort cleanup, post-commit empty-table collection and unchanged legacy direct-drop behavior. Actual tests, not this research return, establish behavior.
