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

Attachment inspection works inside one fixed 32 MiB memory budget per object:
the stored bytes, every decoded buffer and every text copy kept for matching are
charged before they are built, and an object that needs more is uninspectable.
It decodes complete gzip and zlib deflate payloads and textual files with fatal
UTF-8 decoding. Doubled CSV quotes and JSON `\u`/`\/` escapes are scanned as extra
decoded copies; a file that is not valid CSV or JSON is still scanned as text.
Gzip inspection includes every concatenated
member's filename and comment, including nested content encodings, using Latin-1
and lossless UTF-8 where valid. Opaque gzip extra fields,
reserved flags, corrupt header/payload checksums and trailing bytes are uninspectable.
PDF inspection admits a bounded text-only
subset of PDF 1.0–1.7: classic cross-reference tables, standard Helvetica/Courier/
Times Type1 fonts, plain or Flate content streams, and text metadata. It parses
escaped dictionary names, comments, and literal/hex/octal strings structurally;
recognized syntax is accepted or refused according to its decoded meaning.

Images, drawing operators, XObjects, custom or embedded fonts, annotations/forms,
encryption, incremental revisions, object/xref streams, unknown dictionary fields,
unsupported filters or parameters, non-ASCII font glyph bytes, malformed syntax,
and trailing compressed payloads are uninspectable, as are HTML/XML documents,
binary images and opaque objects. This is a bounded inspection
boundary, not a general PDF extractor or OCR service. Only the person's own files
must be inspectable: an uninspectable file in their private source intake refuses
before mutation, naming a key digest rather than its private filename, and
`keepCopies` cannot override it. Another person's uninspectable file is checked by
key and metadata only (a match there is a copy to resolve like any other); otherwise
it stays byte-identical and the plan counts it under `kept` with reason
`not_inspected`, so erasure completes without claiming to have searched it.

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
also refuses atomically when it is their exact email or ID. Independent clean undo
reports remain byte-identical. Their name alone in an import that does not carry
their email or ID (an assignee column, a header, a review, an original file, a
before-image or undo observation) is listed in `erasureCopies` under the store
`import custody`, like a native copy they did not write. Because a name alone may
belong to someone else, the owner confirms it with `keepCopies` and that custody
stays unchanged while the erasure completes.

Effect resolutions an operator recorded are among their identity places: whole-token
copies of their name and email in the receipt's evidence are anonymised, while the
decision, actor ID, time, file hash and original effect stay. Erasing a record
subject replaces the evidence summary and reference on every receipt of its runs
with `Erased.`.

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
