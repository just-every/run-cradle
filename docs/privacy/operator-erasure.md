Operator erasure uses the normal authenticated `member.erase` command after access
removal. A successful response is confirmed only after all planned object deletes
have completed. Whole-token matching and explicit ownership remain mandatory;
other people's native rows, files and independent import jobs are preserved.

Completed or aborted installation transfer artifacts are invalidated under Base's
erasure contract: snapshot/staging tables, archived parts and manifest metadata
are retired together. These are temporary whole-installation copies, separate
from the native records and import-kit originals, plans, provenance and undo
reports that erasure preserves for unrelated people. Active installation transfers
must finish or be cancelled before erasure starts. If one starts during object
deletion, the erasure receipt remains pending until it finishes or is cancelled;
other cleanup jobs can continue. Final confirmation retires terminal copies again
and advances the checkpoint atomically, preventing a delayed export from publishing
an object listing captured before cleanup. The first erasure also initializes its
checkpoint in the native transaction, even if no installation transfer has run.

Attachment inspection decodes complete gzip and zlib deflate payloads with a
32 MiB expansion limit and fatal UTF-8 decoding for textual files; CSV cells are
parsed with the production CSV parser. PDF inspection admits a bounded text-only
subset of PDF 1.0–1.7: classic cross-reference tables, standard Helvetica/Courier/
Times Type1 fonts, plain or Flate content streams, and text metadata. It parses
escaped dictionary names, comments, and literal/hex/octal strings structurally;
recognized syntax is accepted or refused according to its decoded meaning.

Images, drawing operators, XObjects, custom or embedded fonts, annotations/forms,
encryption, incremental revisions, object/xref streams, unknown dictionary fields,
unsupported filters or parameters, non-ASCII font glyph bytes, malformed syntax,
and trailing compressed payloads refuse before mutation. HTML/XML documents,
binary images and opaque objects also refuse. This is a bounded inspection
boundary, not a general PDF extractor or OCR service. The refusal names a key
digest rather than private filenames. The owner must resolve unsupported custody
before requesting erasure again; `keepCopies` cannot override decoding failures.

Import custody uses the maintained Base import-kit retirement helper with a small
atomic composition extension for multiple destinations. Exact email and operator
ID identify sources; a name alone never attributes another person's imported row.
The seed scrubs attributed native values and withdraws affected raw review/report
copies. A mixed job keeps its unrelated effects and their undo, while its erased
sources become zero-effect tombstones; its withdrawn Cradle report explicitly
refuses retrieval. Exact identifying headers retire their complete dependency
closure. Retired imports return a retirement receipt and cannot resume or undo.
Unfinished private preparations with an identifying header are retired; other
private preparations must be finished or cancelled first. This is a conservative
refusal for all unfinished preparations outside retirement closure, including ones
that might become inspectable after publication; they are never silently skipped.
Identity found only in an unattributed reversible before-image or undo observation
also refuses atomically. Independent clean undo reports remain byte-identical.

Additive migrations 9027 and 9028 install reversal fences and append-only
retirement journals without editing applied migrations. Each journal counts
actual changed row images, including original and private-stage custody. The
native admission, all destination retirements, and a Base-compatible portability
redaction checkpoint commit in one D1 batch. A failed native or custody guard
changes none of them. Archives retain retirement receipts and journals. A current
installation refuses its older archive; a fresh restore supplied the later trusted
journal also refuses that archive whole. Erasure cannot delete downloaded backups
outside the installation, and a standalone old archive without that later journal
is not evidence that erasure history is known to a fresh destination.

Focused verification: `node --import ./tests/helpers/typescript-loader.mjs --test
--test-concurrency=1 tests/lifecycle-erasure.mjs`. This exercises the production
HTTP command, authentication, admission, import kit and portability engines with
SQLite and R2/queue edge adapters; emitted-Worker/CLI testing remains separate.
