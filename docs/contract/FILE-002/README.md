# FILE-002 — Attachments from connected file stores

A person attaches a file that stays in their own store. Cradle keeps its name, type, size, modified time and the store's own link, without copying bytes or changing sharing. A base owner can explicitly choose **Keep a copy**; this reads the bytes through the original attacher’s current connection and replaces that reference with an ordinary private attachment. Reading a record, a thumbnail or a reference never copies content.

No real provider call or consent was used. Every journey ran in the emitted Worker against a synthetic provider edge (`tests/helpers/file-stores-provider.mjs`). Real Google, Microsoft, Dropbox and Box consents are NOT RUN.

## Evidence

`tests/evidence-read-privacy.mjs` — `[FILE-002 COLLAB-002 BASE-ACCESS-004]` runs, for each of Google Drive, OneDrive, Dropbox and Box: connect through the consent and callback doors (the asked scope is the narrowest read scope below), list, search, attach, read the reference back as picked, fetch a thumbnail on demand, and then proves that the R2 bucket and `evidence_files` hold nothing, no request kept a file or thumbnail, and the provider saw no write or sharing request. It refuses forged references (another person, an unowned connection, a link outside the store, an extra key), a person without connection authority, and shows a revoked connection as a reconnect state with the name and type still readable. A view CSV carries each reference as provider, id, name, type and link only.

Before (pristine main `0d77622`): `POST /api/v1/records/schema-preview` with an attachment field is refused ("this builder does not support this type"), and `/api/v1/records/file-stores/*` does not exist. After: the journey above passes.

Browser: `tests/ui-base-import.mjs` (`[PERM-007 INTEG-003 FILE-002 RECORDS-005]`, helper `tests/helpers/file-stores-browser.mjs`) opens the chooser from the attachment cell, attaches a Google Drive file, saves, and shows the reference with its on-demand thumbnail at 1440 and 390 (no serious axe finding, no horizontal overflow, nothing copied into private file custody). Screenshots: `file-store-*-1440.png` and `-390.png`.

The personal-connection extension in `tests/helpers/file-stores-personal.mjs` uses native invitation, confirmation and collaborator routes for two editors and a reader. Across all four stores it proves maker isolation (including against the installation owner), preview-only readers with a different provider account, viewer-first access, denial at the provider edge, opt-in attacher sharing, immediate opt-out, and no retained image bytes during the fetch. It also proves current field authority, owner policy and revoke-any, and native deprovisioning. The common lifecycle plan also handles SCIM deprovisioning; a separate SCIM browser journey is not claimed.

Migration `9050_personal_file_stores.sql` is additive. A populated emitted-Worker upgrade preserves the existing provider identity and sealed credentials and leaves sharing off. Dropbox identity comes from the token response’s account_id, avoiding any added account-profile scope.

## Scopes and why

| Store | Scope asked | Why |
| --- | --- | --- |
| Google Drive | `https://www.googleapis.com/auth/drive.readonly` | The in-app chooser lists and searches files and reads metadata; the owner’s explicit keep-copy request reads file content. `drive.file` only sees files the app created or opened through Google's own picker, so an in-app chooser would list nothing. OWNER-STEP CHANGE: the c6 plan names `drive.file`; add `drive.readonly` to the OAuth consent screen instead. |
| OneDrive / SharePoint | `Files.Read`, `offline_access` | Microsoft Graph has no metadata-only file scope; `Files.Read` is the narrowest that lists, searches and reads thumbnails. |
| Dropbox | `files.metadata.read`, `files.content.read` | Listing and search need metadata; `get_thumbnail` is a content endpoint. |
| Box | `root_readonly` (set on the Box application) | Box states scopes in the application, not the token response. |
| Chest | none | Chest is a sibling RunEditRun product ([run-chest](https://github.com/just-every/run-chest)). A Chest file is attached as a link only; no picker against Chest's own API is built. |

## Owner steps

1. In each provider console create an OAuth client and set the redirect URI to `<app origin>/oauth/<family>/callback` where family is `google`, `microsoft`, `dropbox` or `box`.
2. Store the client id and secret as `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`, `DROPBOX_CLIENT_ID`/`DROPBOX_CLIENT_SECRET` or `BOX_CLIENT_ID`/`BOX_CLIENT_SECRET` (all optional; a store without them says so when connecting).
3. Under the installation owner’s provider and connect policy, open an attachment field's record, choose **Choose from a file store**, connect the store and review the consent screen.

## Rules kept

- The owner-only connect floor was interim (ct, 23 October). Writers connect personal read-only stores for attachment; readers connect for previews only. Connections belong to their maker, including against the installation owner. The explicit base-owner keep-copy command is narrowly bound to an existing reference and its original attacher; it checks both people’s current row and field authority, the connection’s content consent and provider policy. It does not grant browsing or credential access to the owner. The installation owner controls provider availability, the connect policy and revocation of any connection. Deprovisioning revokes the person’s connections. Default for any gap no ruling covers: deny.
- Reading a reference needs the same row and field authority as any attachment. Previews first use the viewer’s own connection where the store grants that viewer the item. Otherwise they use the attacher’s connection only after explicit, audited Share previews opt-in (off by default), with both people’s current authority checked on every request. Thumbnail responses are no-store and no image bytes enter D1 or R2. A revoked or removed connection leaves name, type and link.
- The store's link opens in the store, where its own sharing applies. The link must be https on that provider's own host.
- Credentials stay sealed in the existing connection custody, are absent from exports and archives, and every file-store read runs as a connection job.
- Erasing a person removes the references they attached and revokes and deletes the credentials of connections they own.

## Gap (named in CONTRACT.md and ACCEPTANCE.md)

Keep-copy uses the same 10 MiB file limit, guarded R2 checksum verification, current-policy download and record erasure as uploaded attachments. The reference replacement and file metadata commit together; a failed or stale request deletes its staged bytes. Replaying the same command returns its receipt without another provider read. Old Google metadata-only consents must be reconnected to approve read-only content access.

Gap: store-reference exits and returns are FILE-004 (partial: automatic preview lookup, null-account resolution and bulk confirmation remain incomplete); archive restore and attacher erasure have no journey; Chest has no picker against its own API (link only). No real provider call or consent was used; real consents NOT RUN. See the Status of FILE-002.
