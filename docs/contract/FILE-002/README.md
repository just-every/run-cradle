# FILE-002 — Attachments from connected file stores

A person attaches a file that stays in their own store. Cradle keeps its name, type, size, modified time and the store's own link, and nothing else: no bytes, no copy, no sharing change.

No real provider call or consent was used. Every journey ran in the emitted Worker against a synthetic provider edge (`tests/helpers/file-stores-provider.mjs`). Real Google, Microsoft, Dropbox and Box consents are NOT RUN.

## Evidence

`tests/evidence-read-privacy.mjs` — `[FILE-002 COLLAB-002 BASE-ACCESS-004]` runs, for each of Google Drive, OneDrive, Dropbox and Box: connect through the consent and callback doors (the asked scope is the narrowest read scope below), list, search, attach, read the reference back as picked, fetch a thumbnail on demand, and then proves that the R2 bucket and `evidence_files` hold nothing, no request kept a file or thumbnail, and the provider saw no write or sharing request. It refuses forged references (another person, an unowned connection, a link outside the store, an extra key), a person without connection authority, and shows a revoked connection as a reconnect state with the name and type still readable. A view CSV carries each reference as provider, id, name, type and link only.

Before (pristine main `0d77622`): `POST /api/v1/records/schema-preview` with an attachment field is refused ("this builder does not support this type"), and `/api/v1/records/file-stores/*` does not exist. After: the journey above passes.

## Scopes and why

| Store | Scope asked | Why |
| --- | --- | --- |
| Google Drive | `https://www.googleapis.com/auth/drive.metadata.readonly` | The in-app chooser lists and searches files and reads `thumbnailLink` and `webViewLink`. `drive.file` only sees files the app created or opened through Google's own picker, so an in-app chooser would list nothing. OWNER-STEP CHANGE: the c6 plan names `drive.file`; add `drive.metadata.readonly` to the OAuth consent screen instead. |
| OneDrive / SharePoint | `Files.Read`, `offline_access` | Microsoft Graph has no metadata-only file scope; `Files.Read` is the narrowest that lists, searches and reads thumbnails. |
| Dropbox | `files.metadata.read`, `files.content.read` | Listing and search need metadata; `get_thumbnail` is a content endpoint. |
| Box | `root_readonly` (set on the Box application) | Box states scopes in the application, not the token response. |
| Chest | none | Chest is a sibling RunEditRun product ([run-chest](https://github.com/just-every/run-chest)). A Chest file is attached as a link only; no picker against Chest's own API is built. |

## Owner steps

1. In each provider console create an OAuth client and set the redirect URI to `<app origin>/oauth/<family>/callback` where family is `google`, `microsoft`, `dropbox` or `box`.
2. Store the client id and secret as `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`, `DROPBOX_CLIENT_ID`/`DROPBOX_CLIENT_SECRET` or `BOX_CLIENT_ID`/`BOX_CLIENT_SECRET` (all optional; a store without them says so when connecting).
3. As the installation owner, open an attachment field's record, choose **Choose from a file store**, connect the store and review the consent screen.

## Rules kept

- Only the installation owner can connect a store (the existing connection-control rule). Only that person can attach through their connection. Default for any gap no ruling covers: deny.
- Reading a reference needs the same row and field authority as any attachment. A thumbnail is fetched only for the person who attached the file, through their connection, and never persisted. A revoked or removed connection leaves name, type and link.
- The store's link opens in the store, where its own sharing applies. The link must be https on that provider's own host.
- Credentials stay sealed in the existing connection custody, are absent from exports and archives, and every file-store read runs as a connection job.
- Erasing a person removes the references they attached and revokes and deletes the credentials of connections they own.

## Gap (named in CONTRACT.md and ACCEPTANCE.md)

Keep a copy, base JSON export and return of attachment fields, archive restore and attacher erasure journeys, the browser proof at 1440 and 390, and a Chest picker against Chest's API are not built or not run. See the Status of FILE-002.
