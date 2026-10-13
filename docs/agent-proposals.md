# Agent proposals

An agent you run, such as a Claude or Codex session, can design a new base or a
change to one of your bases. It works through a **proposing key**. The agent
proposes, and nothing becomes live until you review the proposal and adopt it.
No model runs inside Cradle, and Cradle needs no AI provider account for this.

This is described for local development. A proposing key on a hosted
installation needs your decision about key lifetime first.

## Give an agent a proposing key

1. Start Cradle with an ordinary sign-in: `rer dev --login`.
   Open the `RER_SIGN_IN` URL it prints, follow the newest sign-in message and
   finish first-run setup. Issue keys from this kind of session. A key issued
   in a dev-identity session (the `RER_OPEN` link) only works together with the
   checkout's dev key, and you must never give the dev key to an agent.
2. Open **Settings → API keys → Proposing keys**. Name the key, choose **A new
   base** or one of your bases, and choose an expiry of 7, 14 or 30 days.
3. Copy the key. It is shown once. Cradle stores only its digest. The panel lists
   the key's name, base, expiry and state, and **Revoke** stops it at once.
4. Give the agent the key and the address. Keep the key in an environment
   variable, not in a prompt, a file you share or a URL.

For Claude Code, add Cradle as an HTTP MCP server (replace the port with your
`RER_READY` port):

```sh
export CRADLE_PROPOSAL_KEY='<the key>'
claude mcp add --transport http cradle http://127.0.0.1:8788/mcp \
  --header "Authorization: Bearer $CRADLE_PROPOSAL_KEY"
```

Any MCP client that can send a bearer header to an HTTP server can use the same
address. A client that cannot can use the REST face below; it offers the same
tools.

## What the agent can do

| Tool (MCP) | REST | What it does |
| --- | --- | --- |
| `schema.read` | `GET /api/v1/proposals/schema` | The base this key may propose for: tables, typed fields, links, lookups, views and forms, plus 100 unused identifiers. A key for a new base gets an empty table list. |
| `schema.propose` | `POST /api/v1/commands/schema.propose` | Propose the complete next schema, with optional views and forms and a note to you. Returns the impact preview you will review. |
| `schema.proposals` | `GET /api/v1/proposals` | The key's own proposals and their state: pending, adopted, declined, stale or withdrawn. |
| `schema.proposal` | `GET /api/v1/proposals/:id` | One of its proposals, with any note you left when declining. |
| `schema.withdraw` | `POST /api/v1/commands/schema.withdraw` | Withdraw one of its pending proposals. |

The agent **cannot** adopt anything, read or write records in any base, issue or
revoke keys, or see another key's proposals. Every other route answers 404 and
every other MCP tool answers "Tool is not available", as a missing one would;
key management answers 401 because it needs your browser session. The key reads
only what you, its issuer, can read now: if your access to the base changes, or
you sign out everywhere, the key is refused at once.

A proposal is the same input as the schema builder's preview (`appId`, `name`
and every table with its fields) plus optional `views`, `forms` and a `note`:

```json
{
  "commandId": "<new ULID>",
  "expected": [],
  "input": {
    "schema": { "appId": "<from schema.read>", "name": "Workshop tool library", "tables": [ ... ] },
    "views": [{ "entityId": "<table>", "name": "Repairs by status", "display": "board",
      "fields": ["<field>", "..."], "sort": [], "groupBy": [],
      "layout": { "titleFieldId": "<field>", "boardFieldId": "<select field>" } }],
    "forms": [{ "entityId": "<table>", "title": "Lend a tool",
      "fields": [{ "fieldId": "<field>", "label": "Tool", "help": "", "required": false }] }],
    "note": "Why I designed it this way."
  }
}
```

Field types are text, number, date, checkbox (`boolean`), select, url, link
(`relation`, to a table in the same base, `onDelete: "restrict"`) and lookup
(`computed` with a `rollup` expression of `aggregate: "lookup"` through a link).
Views are `grid`, `cards`, `board` (grouped by a select field) or `calendar` (by
a date field). Forms create records in their table. To change an existing base,
send every existing table and field: leaving a table out is refused, and leaving
a field out proposes removing it, which the preview names with its count of
stored values. Changing an existing field's type, options or requirement, adding
a required field to a populated table and deleting a table are refused with the
same messages the schema builder gives you.

The preview the agent receives lists the changes and the number of affected
records per table, but never record identities or values. Names, help text and
notes are stored as plain text. Nothing in them can create a grant, a member, a
key, an automation, a connection, a message or an outbound call.

A first request over REST, with the key in `CRADLE_PROPOSAL_KEY`:

```sh
curl --fail-with-body -s -H "Authorization: Bearer $CRADLE_PROPOSAL_KEY" \
  http://127.0.0.1:8788/api/v1/proposals/schema
```

`scripts/agent-proposal-client.mjs` is a scripted agent that turns a short
structured brief into a proposal through either face, which is useful for
trying the door without a model:

```sh
CRADLE_PROPOSAL_KEY='<the key>' node scripts/agent-proposal-client.mjs \
  --brief sample-data/agent-briefs/brief-a-workshop.txt --origin http://127.0.0.1:8788
```

## Review a proposal

Open **Records**. **Proposed by an agent** lists each proposal with the key's
name, the time, a one-line summary and its state. **Review** opens the same
schema-impact screen the schema builder uses, labelled with the key that made
the proposal, followed by its views and forms and the agent's note.

- **Adopt schema** applies it through `release.adopt` with your session. Cradle
  rechecks the stored preview against the current schema, records and your
  access in the same commit. If anything changed since the proposal was made (a
  record edit, an import, another adoption or an access change), the proposal
  is shown as stale and adoption is refused with nothing changed; ask the agent
  to propose again. A proposal from a key that is now revoked or expired stays
  visible and cannot be adopted.
- **Decline proposal** takes one click. The optional note is shown to the agent.

A proposal stays reviewable for 7 days. Adoption is recorded in the audit trail
with you as the actor and the proposal and key named; the release keeps the
preview's hash. Removed values remain recoverable as for any schema release.
