# Owner requirements and divergence

No current product clause supersedes a `BASE-` clause. References in the product
contract refine or defer to the named baseline guarantee; changing meaning
requires an explicit replacement requirement and tests.

Cradle owns its source, schema, UI and infrastructure. Shared layout conventions
are editable and do not create protected ownership boundaries. Exact maintained
source pins and file mappings are recorded in `edition.json` and
`vendor/base/PROVENANCE.json`; source comparison snapshots are maintained by the
implemented `source:lock` and `source:check` commands.

The records-first identity retains launch data, policy and workflow semantics.
Optional repair navigation adds no authority. `RELEASE.json` and
[contract transitions](docs/contract-transition.md) identify changed meanings by
stable clause ID, including the native HTTP/document/Start denial protocol.
Future app authoring, operational loops and improvement obligations remain in
[PLAN.md](PLAN.md) and [ACCEPTANCE.md](ACCEPTANCE.md); their presence is not acceptance.

Audit history survives deletion with personal references anonymised under the
retained guarantees. Upload limits use the actual implemented manifest fields.
Policy defaults cannot weaken an unconditional requirement or a declared
non-goal. Verification must distinguish complete product coverage from scoped
local checks, provider integration, deployed operation and measured performance.
