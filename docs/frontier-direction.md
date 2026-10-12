# An owner-owned expert operation

**Proposed direction, 27 September 2026.** Cradle should continually understand
an owner's business, discover better operating strategies, construct the tools
needed to pursue them, and carry the chosen strategy to measured outcomes.
Records supply grounded memory; applications are editable instruments; the
[operating loops](operating-loops.md) supply dependable execution. Intelligence
belongs at the product's centre and must demonstrate value early.

The qualitative extension is choosing how the business should operate across
cases. Completing every repair efficiently can still waste capital if replacement
or a shared spare would serve the portfolio better. A capable expert operation
can discover that alternative, investigate its assumptions, formulate the hard
allocation problem, build a useful decision tool, and operate the resulting plan.
The owner retains objectives, authority, source, data and the ability to change
any of these choices.

This is planning, not implemented capability or an implementation authorization.
The [current contract transition](contract-transition.md) remains binding,
especially read-only `AI-003`. Portfolio resource planning and optimisation are
explicit additional proposed scope beyond that document's current non-goals;
they require named, accepted replacement clauses before release. No new context,
provider access, mutation or external effect follows from this direction.

## The experience: forty stores, one business decision

This illustrative scenario is a design exercise, not measured customer evidence
or runtime sample data. An owner sets an objective: keep essential cooling
available across forty stores while respecting a cash ceiling, service commitments
and a limit on staff disruption. They can specify hard constraints and priorities
without inventing a single monetary weight for everything they care about.

Cradle first investigates permitted evidence and presents a prepared recommendation
in Today; the owner need not build an optimizer, choose models or repeatedly
manipulate a dashboard. The summary gives status, affected stores, exact proposed
spend and commitments, forecast ranges, freshness/coverage, important unknowns
and the next decision. Business reasons and source evidence expand at case level;
formulations, code and evaluation traces are optional authoring detail.

The on-demand **Operating map** shows assets, service obligations, available contractors,
cash commitments and current failures. Each material fact opens its source and
effective date. Warranty coverage may be confirmed, replacement delivery a supplier
estimate, and spare compatibility unknown. Disagreement stays visible. The owner
can correct a premise and see which decisions it changes.

The on-demand **Decision workbench** compares repairing individual units, replacing a
selected cohort and pooling a compatible spare. It shows the actual stores and
jobs affected, feasible schedules, cash timing, forecast downtime ranges and
assumptions driving the difference. Changing the cash ceiling or protecting one
store's opening day updates the comparison; an infeasible combination explains
which constraints collide. The owner can open ordinary asset, quote and job views
throughout. They need not conduct their business through a chat transcript.

If the answer hinges on spare compatibility, Cradle retrieves authorized existing
evidence first, then performs a useful investigation within its grant or proposes a targeted inspection
or information request and explains how its possible answers would change the
choice. It compares the investigation's cost and delay with deciding now.
Investigation itself uses existing authority; a proposed request is not a send.

Once evidence supports a strategy and the appropriate owner decision or standing
grant covers it, Cradle turns the selection into actual jobs, scoped reservations
and approval requests. A new spare-allocation tool may make that strategy usable.
The workbench exposes downstream consequences before adoption: displaced jobs,
reserved stock, new spending, affected staff and unresolved dependencies. Quote
approval above A$2,000 still belongs to the designated human. Store acceptance
and accounting receipts close the existing repair journey; observed downtime and
cost later test whether the strategy helped.

**Worked illustration (hypothetical timing, not a service promise).** Two of the
forty stores fail now. A repair costs A$1,200 with 72 hours' outage; replacement
costs A$1,800 with 24 hours. B repair costs A$800 with 24 hours; replacement
adds cost without time benefit. Two independent crews can start now. Minimize
combined outage over 72 hours, equal store weights, each outage at most 72 hours,
cash ceiling A$2,600; both permanent units restored by hour 72. One unreserved
spare costs A$200 for move/return. If compatible, immediate setup eliminates its recipient's outage; it stays there
through completion, with no second deployment in this horizon.

| Choice (spare rows conditional on compatibility) | Cash | Combined outage |
| --- | --- | --- |
| Repair both | A$2,000 | 96 hours |
| Replace A, repair B | A$2,600 | 48 hours |
| Spare A, repair both | A$2,200 | 24 hours |
| Spare B, repair both | A$2,200 | 72 hours |

Replacement plus spare costs A$2,800: infeasible. Inspect compatibility before
selecting spare A; otherwise replace A and repair B. Inspection cost/delay is
unknown, so neither its expected benefit nor immediate deployment is established.
Recompute totals after inspection. Any reservation conflict invalidates the spare
premise. These totals never bypass grant budgets or quote approval. Measure actual cash and outage against the
conditional 24-hour forecast and the 96-hour case-repair baseline; causal savings
still require a prospective comparison.

## Eight extensions

### 1. A living business and decision model

Keep an explicit, inspectable account of objectives, constraints, resources,
commitments, relationships and unresolved questions. Distinguish observed facts,
source assertions, owner preferences, assumptions and forecasts. Record when a
fact applied, when it became known and which source/version supports it. A late
invoice must not rewrite what was knowable at the original decision.

Link decisions and forecasts to their dependencies. A corrected asset identity
invalidates affected comparisons; unrelated work continues. The useful result is
an operating map with freshness and uncertainty, not an omniscient digital twin.
Retain access filtering, correction, retention and portable export across this
memory. A polished summary cannot become canonical business truth merely through
repetition.

### 2. Frontier reasoning across the portfolio

Use frontier teams for unfamiliar strategies and coupled decisions: resource
allocation, maintenance timing, replacement cohorts, vendor capacity and service
tradeoffs. Parallel contributors can formulate alternatives, challenge assumptions
and develop independent checks. Their output is a decision artifact with runnable
reasoning where appropriate, rather than a majority vote among models.

Mathematical strength makes it credible to derive a new formulation, construct
an optimizer, adapt it to an unfamiliar constraint and independently check its
solution. Use exact arithmetic, feasibility checkers, exhaustive small-instance
comparisons or certificates when suitable. Label heuristic solutions and any
unproven optimality gap honestly. A checker must validate the intended business
constraints as well as the emitted mathematical instance; a perfectly solved
wrong formulation is still wrong. Real-world benefit requires observation even
when mathematical feasibility is established.

### 3. Fast models doing complete competent work

Fast, capable models can own complete evaluated domain tasks: resolve a bounded
case, assemble a valid allocation, investigate an exception or revise an operating
plan. Do not permanently assign them only extraction or sentence completion.
They also keep context and interactive alternatives current while deeper work
runs where its expected value justifies it.

Route work using measured competence on the task, urgency, uncertainty, stakes,
context availability and expected value. Model size is neither a correctness
certificate nor a price guarantee; a fast model with expensive correction can
cost more than one careful frontier pass. Evaluate providers and versions with
the same quality floor and include retrieval, checking and recovery. Provider choice remains source-neutral and follows measured task competence.

Jev is a candidate for a distinct role. TypeSafe's 15 September 2026
announcement describes an early-access model returning typed probabilistic
decisions in parallel, without free-text generation. It reports 70–500 ms
end-to-end responses: vendor measurements, not Cradle task latency. Its evaluations
compare answers with averaged frontier-model responses rather than independent
ground truth, and acknowledge benchmark bias. Typed output is not truth; Jev is
not a general text/code generator. [TypeSafe's announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

For Cradle, we propose frontier reasoning that formulates and generates an
operating program and its tools; a fast typed decision model handles ambiguous
choices inside it; deterministic code enforces exact constraints and authority.
Frontier reasoning revises the program for novelty or changed objectives instead
of repeating full deliberation on every event. Separately, fast generative models
may perform complete domain tasks after evaluation.

Expose the first useful validated result separately from the final completed
analysis. Show what is still unresolved and retain the last valid comparison
with its age. Measure interaction latency, end-to-end task completion and token
throughput separately: network, retrieval and verification can dominate perceived
speed. Set interaction targets after the first real vertical supplies a baseline.

### 4. Parallel contingent planning

Explore consequential branches before they occur: the contractor withdraws, the
spare is unavailable, cash tightens or inspection reveals a different fault.
Bound the number and cost of branches by their likelihood and decision value.
Read-only forecasts and prepared candidates can reduce time to a useful response.
They cannot secretly reserve stock, send requests or acquire authority.

Each candidate names its assumed evidence, resource versions, policy and expiry.
When a branch becomes relevant, refresh these dependencies and recheck feasibility
before admission to the durable action path. Two attractive plans cannot each
consume the same spare. Stale candidates are revised or rejected; speculative
work never supplies proof that an external action happened.

### 5. Investigation as a first-class choice

Ask which missing evidence would most change the decision. Select inspection,
source retrieval, a supplier question or a bounded operational experiment where
its expected information value exceeds its cost, delay and disruption. Show the
possible answers and the decisions each would support, including the option to
act now or wait without another model call.

A forecast predicts; a correlation suggests an association; a causal claim needs
an identification argument and suitable evidence. Repeated failures after one
contractor's visits might reflect that contractor receiving the hardest jobs.
Cradle should seek discriminating evidence instead of promoting that attractive
story into policy. Any prospective experiment needs a defined population,
comparison, outcome window and stopping rule, plus the authority its actual
effects require. Inconclusive evidence stays inconclusive.

### 6. Strategy becomes useful software

When the winning strategy needs a capability the application lacks, construct
an inspectable candidate: a compatibility schema, spare reservation board,
replacement simulator or different dispatch workflow. The discovered operating
need explains each change. Build a complete useful tool before expanding a
generic framework; ordinary owner source edits remain available.

Keep stable record views and existing app navigation accessible. The workbench
can reveal a purpose-built instrument without continuously rearranging the
owner's daily screens. Preview schema, behavior, access, migration and existing
work consequences; evaluate and adopt through the existing improvement/release
path. A strategy recommendation cannot deploy its own software or broaden its
grants. Measure whether the instrument improves decisions and subsequent work,
not merely whether the generated code builds.

### 7. Verified knowledge compounds

Retain successful domain procedures, source code, constraints, formulations and
adjudicated test cases with their scope and evidence. A verified allocation
procedure can serve later decisions at lower latency; a fast model can operate
it or adapt it within evaluated bounds. Changed assumptions or novel constraints
trigger renewed evaluation instead of silent reuse.

Independent checks and observed outcomes establish usefulness. The producing
model cannot grade its own answer, redefine success or turn its preferred cases
into the entire benchmark. Version reusable knowledge, preserve failures and
hold out fresh cases. Owner-private operational memory stays owner-private;
sharing reusable source requires deliberate selection and removal of private
material. There is no implicit training upload or cross-owner memory pool.

### 8. Optional coordination with neighbouring products

Cradle can connect operational state to HappyToHelp conversations/resolutions
and Orbit commercial intent through explicitly scoped, source-owned references
and permitted actions. A service issue could inform an operational investigation;
a resulting resolution could provide support context. Separate products keep
their identities, authoritative fields, permissions and release decisions.

Orbit's `OUT-001` requires human approval for every customer send: an
authenticated operator must see the exact recipient, subject and body and invoke
sending, or approve the unchanged scheduled content. No Cradle plan, adapter or
grant removes that rule. HappyToHelp remains an independent support product;
its live production service is unchanged. This coordination is an optional
horizon, not a dependency of Cradle's intelligent vertical or flagship release.

## Prove intelligence before completing the engine

The first implementation remains the accepted TanStack Start migration. Next
comes tangible owner-reviewed UX. Immediately after those, build **one intelligent
vertical** using authorized historical data and scoped, read-only tools, before
finishing the generic records engine. Required context extensions receive their
explicit contract treatment first; historical data is not blanket provider
permission. If authorized data is unavailable, report that dependency rather
than substituting fabricated business evidence.

The vertical must deliver a portfolio decision, an adapted executable optimizer
and independent feasibility check, a useful evidence-acquisition choice, and an
interactive tradeoff surface. Use the repair/replacement/spare problem to prove
the experience. It may operate on a bounded snapshot and an isolated candidate
app; its success does not claim live execution, general app construction or
completion of either existing application. Its failed attempts should improve
the formulation, context and interface before infrastructure expands around it.

Proposed proof dataset: 30 historical portfolio decision snapshots from the
selected 40-store operation, 20 development and 10 sealed later snapshots.
Partition linked incidents/assets and duplicate source records together; reserve
store groups for the sealed portfolio holdout, preserving shared commitments.
Each snapshot freezes source identities and versions, effective/known-at timestamps, asset
condition/warranty, quotes/lead times, crew capacity, stock/compatibility,
cash/service constraints and authority at its decision cutoff; later outcomes
stay evaluator-only. Plan repair/replace/spare/wait/inspect read-only over seven
days. Unknown inspection outcomes remain conditional. Novel adverse constraints
are test-only variations, never historical business claims.

Predeclared target: 100% of admitted candidates pass independent cash, capacity,
service and authority checks, with no invented facts. For decision quality,
independently solve each small instance exactly or certify a lower bound L on
weighted outage; let B be the feasible case-loop baseline and C the candidate,
using identical cutoff information, choices and objective. Require C ≤ B and
C − L ≤ 0.1 × max(B, 1 weighted hour) on at least 9/10 sealed snapshots.
Unsolved, uncertain or unscorable snapshots remain in that denominator as
non-passes. Require rejection of the false causal explanation or a request for
discriminating evidence on every such test; report variation results separately.
These are acceptance hypotheses for historical expected-objective quality,
not observed prospective benefit.

Agree objectives, quality floor and scoring before running. Withhold cases and
stores, including novel constraints and a seductive false causal explanation.
An independent evaluator checks source fidelity, formulation, mathematical
feasibility, appropriate investigation and decision quality. Test changed
constraints and stale branches. Model agreement is not ground truth. Evaluate
counterfactual forecasts against their available evidence, avoiding hindsight
leakage; historical replay cannot prove a realized business saving.

Compare the existing case-level loop, frontier-only, fast-only and evaluated
hybrid approaches. Include a capable current incumbent and a capable agent
starting from scratch at equivalent scope where proportionate; record missing
or unmatched comparisons. Count all attempts, owner attention, data preparation,
retrieval, inference, checkers, latency and correction work. Measure time to first
useful validated result separately from full completion. A hybrid earns its
place through results, not a presumed hierarchy of models.

Then integrate the useful vertical with the records, authority, durable execution
and continuing-operation packages. A prospective authorized pilot measures actual
downtime, service, cash use, rejected decisions, owner effort and recovery against
a declared baseline and comparison method. Preserve failed, open and inconclusive
cases. Longer-term business evidence remains separately reported from local
technical acceptance.

## Ambition and economics

The flagship requires extensions 1–7 at the demonstrated scope, culminating in
strategy-to-execution with verified reuse. It does not require universal business
simulation, every possible optimizer, an inter-product network or an always-on
team. Those are candidate horizons to earn through demonstrated owner value.
Existing repair, launch and held-out third-app obligations remain intact.

The existing 30% owner-effort reduction is a minimum hypothesis, not an ambition
ceiling. Better allocation can improve outcomes unavailable to faster processing
of the old workflow. Measure that additional value alongside total build,
operate and maintain cost, including the attention consumed by investigations
and approvals. Repeated useful decisions, owned evidence and reusable verified
instruments must make Cradle preferable to an increasingly capable agent building
from scratch; ownership alone does not establish an economic advantage.

Use event-driven selective inference, explicit budgets and stop rules. Recompute
when evidence or a consequential constraint changes, reuse still-valid results,
and reserve parallel exploration for valuable uncertainty. Count active human
minutes across every role, transferred work, repeated inputs and owner
interruptions per verified outcome, including failed/open/cancelled cohorts;
reducing owner attention by adding unmeasured staff work is not a saving. Calling a model for
every cell every second is neither required intelligence nor a business model.
The promise to prove is a better-running owner-controlled operation.
