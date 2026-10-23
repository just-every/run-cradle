# API-USER-002 — schema-backed record REST operations

Status: partial. The per-base document at
`GET /api/v1/apps/{appId}/openapi.json` describes the live, readable tables in a
record REST namespace: `/api/v1/apps/{appId}/rest/entities/{entityId}`. Each table
has schema read, condition/sort/cursor query, record get/create/update/delete,
batch create/update/delete, and unique-field upsert operations. The retained
command, view, form, attachment and comment APIs keep their existing contracts;
this document describes the new record namespace rather than inventing routes
for unbuilt features.

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
All new operations use the existing PERM-003 record read/create/update/delete
policy actions and API-USER-001 owner key-issuance boundary; no role-matrix text
or broader reader/author role is added.

Proof extends `tests/user-api-keys.mjs`'s existing `[API-USER-001]` registration
with `[API-USER-002]`, through `tests/helpers/rest-api-journey.mjs`. It loads
the generated document, obtains every operation's path and method from it, and
validates successful request/response bodies against its JSON Schemas with the
repository's existing Ajv 2020 implementation. On the emitted Worker, with a
real scoped credential, it exercises all eight documented operations; sorted
pagination and condition filtering; 100 creates, 100 updates and 100 deletes;
101-row refusal for each batch operation; create/update/delete whole-request
refusal; policy narrowing; one admission and replay; unique-field upsert create
then update; explicit delete scope, exact-ID confirmation and actual Trash;
and narrower schema, document and record/query responses. A deleted subject
keeps the maintained replay policy: a second request with its command ID is
refused as 403 and creates no second admission. Create and upsert replays return
the original version and values while current read authority permits them. Native owner sign-in
uses the existing synthetic mail edge. No real provider, consent or mail is used.
No screen changes in this clause; browser proof is not applicable.

Defaults ADOPTED: batches are all-or-nothing; delete is separately opted into;
existing issuer/key/row/field policy and owner-only credential issuance govern
every operation; REST writes require readable fields; conservative refusal of
unique-value swaps; deny receipt replay after the subject becomes unreadable
in Trash. No migration or new credential lifetime is introduced.

Gap: attachment upload and comments over this documented REST namespace;
personal access tokens and API-USER-004 lifetime policy; formula predicates;
per-key rate limits with 429 and Retry-After (the existing sign-in limiter is not
a per-key REST limit); schema writes beyond RECORDS-007; Settings controls and
labels for delete-key issuance; receipt replay for deleted/unreadable subjects under wider custody rules; the
complete field/type, linked-delete,
concurrent-upsert and capacity-race matrix, and hosted scale. Gap (SCALE-002):
unproven above 100 physical columns.
