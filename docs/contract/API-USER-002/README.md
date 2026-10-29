# API-USER-002 — schema-backed record REST operations

Status: partial. The per-base document at
`GET /api/v1/apps/{appId}/openapi.json` describes the live, readable tables in a
record REST namespace: `/api/v1/apps/{appId}/rest/entities/{entityId}`. Each table
has schema reads, filtered and sorted queries, versioned record mutations, atomic
batches and unique-field upserts. Native comments and owner-session attachment
uploads are also described. See [the API guide](../../api-v1.md) for inputs,
authority boundaries, formula bounds and declared credential rate limits. The document is standard OpenAPI JSON at the response root;
record operations use the existing data/meta envelope.

Requests use the current API-key scopes, issuer delegation, row/field policy,
schema and record versions. Create/upsert requires `schemaVersion`; update and
delete requires the current record `version`. Every write uses the maintained
record writer and the existing atomic admission compiler. There is one admission
per batch, with all policy/version/validation guards and all record, audit,
invalidation, automation-event and trash mutations in that transaction.

Batches contain 1–100 rows. Over-limit input, an invalid row, duplicate record
identities, repeated proposed unique values, a stale schema/version or an
unreadable/unwritable row refuses the whole request. No row is silently dropped.
Upsert names a currently readable and writable scalar field with an existing
uniqueness rule. It creates on no match and updates exactly one match under its
current version; physical uniqueness and ordinary writer guards fence races.
A null merge value and a non-unique, collection or computed merge field are
refused. Swapping existing unique values within one batch is conservatively
refused by the ordinary writer's preflight.

Delete calls the maintained deletion preparation and impact path. Every row
requires confirmation equal to its exact record ID, as the single-record command
does. Deletion puts the record in existing 30-day Trash; no purge door is added.
An API key needs `record.delete` separately from update. The existing owner-only
key-issuance API accepts `allowDelete: true` with `permissions: "write"`; an
ordinary write key gains no delete access. The existing 30-day expiry,
revocation, grant and current-issuer fences are unchanged.

The REST representation omits unreadable field identities as well as values,
including the generated document, schema and record/query/write responses.
Only readable fields may be submitted through this namespace; the retained
command API's write-only-cell semantics are unchanged. Unavailable-cell field
references are narrowed too. A final current-scope check fences every response.
Record operations keep their PERM-003 actions and API-USER-001 owner issuance
boundary. Comments invoke the native comment commands. Uploads require a current
workspace owner session and the field write policy; record keys receive no
implicit upload or comment write grant.

Proof extends `tests/user-api-keys.mjs`'s existing `[API-USER-001]` registration
with `[API-USER-002]`, through `tests/helpers/rest-api-journey.mjs`. It loads
the generated document, obtains every operation's path and method from it, and
validates successful request/response bodies against its JSON Schemas with the
repository's existing Ajv 2020 implementation. On the emitted Worker, with a
real scoped credential and native owner session, it exercises the documented operations; sorted
pagination and condition filtering; 100 creates, 100 updates and 100 deletes;
101-row refusal for each batch operation; create/update/delete whole-request
refusal; policy narrowing; one admission and replay; unique-field upsert create
then update; explicit delete scope, exact-ID confirmation and actual Trash;
and narrower schema, document and record/query responses. A deleted subject
keeps the maintained replay policy: a second request with its command ID is
refused as 403 and creates no second admission. Create and upsert replays return
the original version and values while current read authority permits them. Native owner sign-in
uses the existing synthetic mail edge. No real provider, consent or mail is used.
Settings delete-key issuance uses the native Settings journey named in CONTRACT.md.

Defaults ADOPTED: batches are all-or-nothing; delete is separately opted into;
existing issuer/key/row/field policy and owner-only credential issuance govern
every operation; REST writes require readable fields; conservative refusal of
unique-value swaps; deny receipt replay after the subject becomes unreadable
in Trash. No migration or new credential lifetime is introduced.

Gap: ct contract conversion and generated-document synchronization; personal
tokens and API-USER-004 lifetime policy; scoped upload and comment-write
delegation; formula predicates above 10000 condition-filtered candidates; schema
proposal types beyond RECORDS-007; automatic linked unlink and cascade authoring;
receipt replay for deleted or unreadable subjects under wider custody rules;
hosted physical scale and SCALE-002 wide-table proof. Current replay refuses an
unreadable subject. Capacity boundary-counter checks do not establish physical
scale. Ordinary record keys still cannot upload files or write comments.
