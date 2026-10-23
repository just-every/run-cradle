# FILE-004 — Store references in exits and returns

Status: missing. Ct, 23 October 2026.

- **FILE-004 — Store references in exits and returns.** A connected-store reference (FILE-002) leaves every base exit (base JSON, CSV-set, workbook) as a portable reference and returns through every base return (RECORDS-005, the RECORDS-006 copy, INTEG-003 workbook import) without copying bytes, calling a store write, or using anyone's credentials but the returning person's own.

  **Shape.** One object per reference, in the field's order, beside FILE-003's `kind:"file"` entries:
  ```json
  {"kind":"store","schema":1,
   "provider":"google-drive|onedrive|dropbox|box|chest",
   "account":"<store's opaque drive/namespace id, or null>",
   "itemId":"<store's stable item id>",
   "name":"…","type":"<MIME>","size":<bytes|null>,"modified":"<ISO 8601 UTC|null>",
   "digest":{"algorithm":"sha256|sha1|md5|quickxor|dropbox-content-hash","value":"…"}|null,
   "link":"<store's own https link on the provider's host, or null>",
   "attachedBy":"<person reference as RECORDS-006 exports people values>",
   "attachedAt":"<ISO 8601 UTC>"}
  ```
  - `digest` is the store's own content hash: Drive sha256, else sha1 or md5; OneDrive sha256, else quickXor; Dropbox content_hash; Box sha1. It is null only where the store gives none (native Google documents, Chest links).
  - An export never carries the connection ID, a token or other credential, a thumbnail URL, a temporary or signed download URL, sharing settings, resolution state, or bytes.
  - Base JSON holds the array natively. CSV-set and workbook cells hold the same array as canonical JSON text (sorted keys, no whitespace).
  - The existing per-view CSV keeps its FILE-002 columns.
  - Row and field policy, and RECORDS-006 fencing, apply as to any value. An erased attacher exports as their anonymous label.

  **Return.**
  - Preview makes no writes. It resolves each reference by a read-only connection-job metadata lookup, only through a connection already held by the returning person for the same provider and account, and it names counts for each outcome.
  - Resolved means the item is found and the digest matches. A null digest also resolves, but is marked "unverified".
  - Each other outcome lands as a visibly **unresolved** reference: no matching connection; not found or no access; digest changed. An unresolved reference shows its name, type, size, provider and link, with an "Unresolved" badge and no thumbnail. It is listed on the move-in receipt beside the skipped-attachment list.
  - Import never prompts for consent mid-job, never binds a reference to another person's connection, and never guesses. A cell that is not a valid array is a row error naming the cell.
  - Afterwards, a person with write authority on the field and a matching connection of their own can resolve references. A changed digest is accepted only by explicit per-reference or bulk confirmation, which is recorded and refreshes name, size, modified and digest from the store.
  - The portable fields are canonical content, so re-exporting a base whose references are still unresolved reproduces identical objects. Resolution state and connection binding are installation-local, outside the capture envelope.

  *Acceptance:* In the emitted Worker, with stores faked only at the network edge:
  - A base with references from all four stores, a Chest link and a mixed field round-trips through base JSON, CSV-set and workbook. Every export is scanned and holds no connection ID, sealed secret, edge token, thumbnail URL or temporary URL.
  - Return to a fresh installation with no connection lands every reference unresolved and visible at 1440 and 390.
  - Connecting the matching store and resolving binds each reference. A digest changed at the edge stays unresolved until confirmed. Another person's connection is never used.
  - Re-export before resolution gives byte-equal reference objects.
  - A restricted field is absent.
  - A malformed cell is refused naming the cell.
  - The provider sees no write or sharing call.

  *Status:* missing — base JSON, CSV-set and workbook exports refuse attachment fields that hold store references (FILE-002 Gap).

Gap: base JSON, CSV-set and workbook exports refuse attachment fields that hold store references (FILE-002 Gap).
