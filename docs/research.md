# Structured-records market evidence

**Research current to 27 September 2026.** This is a concise synthesis of the
owner-supplied analysis and a same-day check against official vendor materials.
The supplied text says its research was current to 25 September 2026, but its
`:chatgpt-content-reference` markers are opaque and it contains no bibliography;
those markers cannot be independently resolved. The links below are direct
vendor/product sources checked for this planning decision. No vendor tenant was
tested and no reliability or performance benchmark was run.

## Synthesis and product implication

The supplied analysis argues that structured-records software is evolving,
while a generic “build a tracker” proposition is becoming easier to copy. Its
central distinction is useful: the durable value is the business's operational
model—what exists, how it relates, what evidence supports current state, and who
may take the next action—not just the spreadsheet-shaped screen. The repair
example from source intake to verified work and accounting handoff is an
assembled scenario, not a claim that one competitor product reliably performs
that whole job.

The official sources support the direction of the feature trend: vendors
document AI-assisted application construction, field enrichment, record
operations and configured workflow actions. They also show different maturity
levels and constraints. Generic generation, chat, AI field updates, integrations,
approval routing and open-source access each already exist in some form; none is
a sufficient differentiation claim by itself.

The product opportunity is therefore a **hypothesis**: owners may value an
editable application that carries important work across systems with explicit
authority, evidence, reconciliation, recovery and measured reduction in owner
attention. Ownership alone is not a moat. We must test a complete outcome and
ongoing economics against both an existing platform and an agent building from
scratch at the same quality floor. Product launches and vendor adoption claims
do not establish market size, paid growth, retention, financial health or
workflow reliability.

## What current official material documents

| Product | Verified status and limits | Implication for Cradle |
| --- | --- | --- |
| **Airtable** | The [Omni guide](https://support.airtable.com/articles/1744327578-Using-Omni-AI-in-Airtable) documents questions, analysis, app edits and record operations under user permissions and credits, but its own page conflicts about view/form creation. [Field agents](https://support.airtable.com/articles/8052242094-using-airtable-ai-in-fields) generate/analyze field values. The [MCP guide](https://support.airtable.com/articles/9897799762-using-the-airtable-mcp-server) permits specified record access and automation drafts; activation still occurs in Airtable and documented interface/script editing has limits. A linked-record [view filter is not an authorization rule](https://support.airtable.com/articles/8324991167-limiting-linked-record-selection-to-a-view-in-airtable). | AI construction and record access are already part of the category. Enforcement must live in server-side policy, not filtered choices or the normal UI. Do not claim every Omni construction action is available. |
| **Microsoft Power Apps** | [Plan Designer](https://learn.microsoft.com/en-us/power-apps/maker/plan-designer/plan-designer) is documented as generally available with Dataverse/locale prerequisites. [Generative pages](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/generative-pages) create editable React pages, with regional limits and connector-backed sources/tools marked preview. Feature-specific [agent feed](https://learn.microsoft.com/en-us/power-apps/user/supervise-agents-with-agent-feed) and [Power Apps MCP](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/power-apps-mcp-server) documentation still labels those features preview. | AI-assisted solution construction is live in an established low-code product. Keep preview supervision features distinct from generally available construction. [Lists lookup relationships](https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/create-list-relationships-by-using-lookup-columns) and [Dataverse data/security capabilities](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/why-dataverse-overview) document different underlying capabilities; do not treat them as one product. |
| **Quickbase and Pave** | The [AI capabilities page](https://www.quickbase.com/product/ai-capabilities) separates GA AI Actions/Workflows/Agent from beta Chat-to-App/Spreadsheet Import. [AI Actions](https://help.quickbase.com/docs/ai-actions) are configured pipeline steps with structured outputs; context is not implicitly shared between steps. The 21 September [Pave announcement](https://www.quickbase.com/news/press-releases/pave-advances-agentic-orchestration-connectors-workflows) says Connectors and Workflows are available on all four plans and cites 350+ systems, while the [Pave home](https://www.quickbase.com/pave) still labels them “Coming soon” and its [FAQ](https://www.quickbase.com/pave/frequently-asked-questions) describes advanced integrations as roadmap. These are conflicting first-party availability claims; the count and security language are vendor claims, not independent tests. | State maturity feature by feature. Treat Pave as newly announced available with conflicting current product pages, not proven tenant availability or connector coverage. Integration breadth alone is weak differentiation. |
| **SmartSuite** | Its [MCP guide](https://help.smartsuite.com/en/articles/17038617-smartsuite-mcp-server) documents reading/writing records and building/editing structure and automation under member permissions plus a workspace gate, with attribution. [AI Field Agents](https://help.smartsuite.com/en/articles/12944386-ai-field-agents) can write supported fields manually or on change, with history; [AI Workflow Agent](https://help.smartsuite.com/en/articles/11644263-automation-action-ai-workflow-agent) is a configured automation step. The docs reviewed do not establish a mandatory human approval for each later business action. | Permission-aware AI tools and audit attribution are useful controls, but do not alone enforce domain-specific conditions, evidence or separation of duties. A configured “agent” step is not equivalent to an independently accountable end-to-end operator. |
| **Baserow** | Its [2.2 release](https://baserow.io/blog/baserow-2-2-release-notes) and [Kuma application guide](https://baserow.io/user-docs/build-applications-with-ai) document prompt-generated application pages, data connections, forms and actions. Its official docs cover [self-hosting](https://baserow.io/user-docs/set-up-baserow) and [workspace export](https://baserow.io/user-docs/export-workspaces)/[import](https://baserow.io/user-docs/import-workspaces); the sources checked did not document standalone code export for a Kuma-built application. | Open-source self-hosting and generated forms are real alternatives. Do not imply that a product owned at the runtime/data layer is automatically portable as standalone source. |
| **Lovable** | The official [GitHub guide](https://docs.lovable.dev/integrations/github) documents code export/two-way sync, one active branch and no import of an existing repository. [Cloud](https://docs.lovable.dev/features/cloud), [advanced settings](https://docs.lovable.dev/features/advanced-settings), [ownership/deployment](https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership) and [connectors](https://docs.lovable.dev/integrations/introduction) document distinct code, data and runtime paths. Advanced settings documents schema and row export, while the Cloud migration guide still says there is no one-click move to customer-owned Supabase and advises rebuilding the destination schema after data export. These are separate export/migration paths; the complete exit sequence was not independently tested. | Code can move, but a Git copy is not a complete operational exit. Cradle must plan data, files, identity, secrets, connections and runtime responsibility separately and prove restore. |

The reviewed official sources establish product positions and documented
capabilities only. They do not prove task accuracy, reliability, production
availability in a particular account, complete connector behavior or total cost.
The attachment's vendor usage figures are not used as market-size evidence:
they use different definitions and do not establish comparable paid growth or
retention.

## Evidence ledger

- **Shipping/documented:** feature-specific current help or product documentation
  describes the feature; this is not an independent runtime test.
- **Generally available:** only where the vendor's current feature-specific
  material explicitly says GA or available. Prerequisites and limits still
  apply.
- **Preview/beta:** retained as such when current feature documentation says so;
  a planned date or broader overview does not override the narrower label.
- **Announced with conflicting availability:** Pave Connectors/Workflows, because
  the 21 September release says available while current home/FAQ pages say
  coming soon or roadmap.
- **Not established:** no claim is made here about revenue trajectory, market
  size, comparative reliability, universal tenant availability, or complete
  migration of an arbitrary generated app.
- **Inference:** “generic generation is becoming less defensible” and
  “owner-controlled operations with verified continuity may be valuable” are
  strategic interpretations of these sources and the Run Edit Run thesis, not
  reported measurements or proven defensibility.

## Research boundary

The initiating research input is retained privately and is not distributed.
This synthesis does not reproduce its opaque inline citation markers or long
vendor passages. Product status was checked on 27 September 2026; where the
source page had no useful publication date, that is not treated as a release
date. Recheck feature-specific documentation and account availability before a
future build decision that depends on current vendor behavior.
