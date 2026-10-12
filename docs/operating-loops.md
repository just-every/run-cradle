# Continuing operation and improvement

These are proposed flagship capabilities, not current behavior. They depend on
accepted contract transitions, especially `AI-003`, and the typed authority and
durable admission rules in [architecture](architecture.md). A running operator
cannot issue, broaden or renew its own grants, change verification criteria, or
write arbitrary fields. An improvement candidate has no live authority. Existing
`AUTO-005` run-chain limits remain binding; continuing goals cannot reset counters
to evade them. Any different future run/goal semantics require an explicit clause
transition and bounded work limits. If a model is unavailable, reasoning pauses
visibly; ordinary manual and already-authorized deterministic work remains usable.

## Continuing operation

Cradle prepares an **operation mandate** from the owner's outcome, existing
sources and business constraints: objective, eligible cases and sources,
priority/deadline rules, permitted typed actions, standing grants, spend/model/time
budgets, verification target and evidence requirements, review cadence, stall
limits and escalation recipient. The owner confirms business limits and meaningful
authority in a plain-language card; proposed defaults stay inactive until
accepted. Cradle chooses and evaluates technical routing, schedules and tooling
within those limits. Provider consent, authentication and missing secrets remain
explicit steps for the authorized person; connecting a source grants no action
permission. Prefill known facts and reuse answers; fetch permitted evidence before
asking the smallest consequential question of the responsible person. For repairs the objective can be accepted repair
and confirmed accounting handoff within the agreed service window. Neither a
contractor claim nor an operator's own completion assertion meets that target.

**Today** leads with prepared decisions, work being handled and verified finished
outcomes. No daily visit is required. Summaries state recommendation, status,
impact, freshness/coverage, important unknowns and next step; reasons and evidence
open at case level, technical traces one level deeper. Exact spend, exposure,
access and new commitments remain visible wherever consent is requested.

The on-demand **Operations** surface shows mandates, unfinished/overdue/newly changed cases,
current plans and reasons, next wake time, grant/budget remaining, verification
results and intervention needs. The owner can narrow scope, pause, revoke, change
priorities, correct evidence or take over. The on-demand **Case supervision** surface shows
plan revisions beside their triggering evidence, considered permitted alternatives,
selected next action and its expected outcome, receipts and failed checks. A
correction records actor, prior value/claim, replacement, reason and evidence;
it invalidates dependent proposals and reopens evaluation without erasing history.

Persist mandate/goal version, case identity and objective status, source versions,
plan revisions, selected actions and rationale summaries, action/attempt/receipt
links, verification records, budget reservations/consumption, lease/checkpoint,
next wake and stop/escalation reason. A run is a bounded period of work on this
state, not the goal itself; a worker restart cannot forget outstanding work or
reset its budget. Restore respects revoked grants and reconciles in-flight effects.

At each permitted wake, the durable operator:

1. Selects eligible unfinished, overdue or changed work, recording priority and
   why it was selected; deferred eligible work remains visible with its next check.
2. Refreshes authorized evidence and current versions, identifies the gap to the
   objective, then forms or revises a bounded plan. Events and schedules wake this
   reasoning; they do not prescribe all subsequent steps.
3. Chooses a next action from the available typed actions, explaining its expected
   contribution and evidence. Server policy independently rechecks authority,
   versions, preconditions and budgets at admission. A proposed action is not a grant.
4. Observes receipts and independently checks the outcome against the owner's
   verification target using canonical state and separately obtained evidence
   (such as store acceptance and an accounting readback). A second model's agreement
   alone is not verification. Failed or changed evidence returns to planning.
5. Records completion only when the target is verified; otherwise schedules a
   justified next check or continues within limits. Authority gaps, material
   uncertainty that permitted investigation cannot resolve in time, stalled/repeated ineffective actions, exhausted budgets, expiry,
   revocation, cancellation or human takeover stop the affected work and surface
   a named reason, evidence, next decision and accountable recipient. Unknown
   external outcomes go to reconciliation before any potentially duplicate effect.

Routine recovery and granted work stay quiet and inspectable. Group meaningful
nonurgent updates at an optional cadence, deduplicate urgent decisions and route
them to the person who can act. Reminders follow due/escalation state changes and
existing notification rules; do not suppress required critical alerts or conceal
a material outage. An escalation names impact, the prepared next choice, what
happens without an answer and next check. Novelty is work for Cradle when within
competence and authority, not an automatic reason to interrupt the owner.
Pause/takeover stops new admissions within its documented boundary; it cannot
undo committed external effects. Reconcile unknown outcomes and separately
authorize any cancellation or compensation.

**Worked continuation:** a store rejects a contractor's completion because cooling
fails again. The existing run had been waiting for acceptance. New temperature
readings invalidate that plan, so the operator reopens the objective, examines
warranty and visit evidence, and selects a permitted diagnostic request instead
of invoice handoff. The contractor then loses its eligibility credential. On the
next wake the operator rejects its earlier rebooking option, requests availability
from another eligible contractor under the standing communication grant, and
compares a replacement quote. A quote above A$2,000 stops at the manager boundary;
it cannot reuse the old approval. Once a manager authorizes the exact new quote,
work resumes from durable state, verifies the new visit, obtains store acceptance
and reconciles the accounting receipt. Each choice cites the changed evidence;
no per-step click is needed where the standing grant actually covers the action.

## Evidence-to-improvement loop

The **Improvements** surface groups recurring exceptions, corrections, stalls and
scorecard changes by process/app/model/context/routing version. It shows cases,
missing evidence, a proposed cause and competing explanations, expected benefit,
cost, affected users/authority, and the proposed process or application diff.
Cradle investigates and evaluates before asking. Owners can reject, correct or
authorize a ready adoption decision; eligible changes under an existing bounded
release grant need no repeated approval. Further evaluation remains available
on demand, without requiring owners to curate prompts, tests or model settings. A recurring
exception is a hypothesis to investigate, not permission to weaken policy.

Persist improvement identity, source case and correction cohort, hypothesis, baseline,
candidate versions, evaluation sets/results, adoption decision and authority,
release identity, measurement window and recovery decision. Evaluate changes to
model choice, context selection, extraction schema and action routing alongside
process/forms/source changes; record versions, output correctness, prohibited
actions, objective completion, cost and latency. Corrected cases feed adjudicated
regression examples with privacy controls; retain held-out cases to avoid scoring
only examples used to design the fix. Models cannot mark their own outputs correct.

Replay historical cases against fixed authorized snapshots and compare current
and candidate behavior; shadow fresh cases with no external writes. Show skipped
or unreplayable cases and coverage limitations. Existing policy/fault/contract
checks must still pass. Adoption requires an authorized owner decision or a
previously issued, explicit low-risk release grant; new authority/egress cannot
be inferred from a performance improvement. Use the architecture's candidate,
migration, in-flight action and recovery rules. Measure the same scorecard and
cohorts after adoption; retain exposure denominators and changes in case mix.
If the agreed quality floor regresses, stop rollout, preserve receipts, recover
the prior compatible release or apply the rehearsed forward repair, and separately
authorize any external compensation. Do not erase the failed experiment.

**Worked improvement:** repeated wrong-asset corrections trigger investigation.
First test whether known store/asset records, retrieval, context selection or
extractor instructions solve the problem without another staff task. Compare
competing explanations against source evidence. Only if insufficient, evaluate a
conditional serial-plate photo request for genuinely ambiguous assets, reusing
already supplied photos and answers rather than adding a mandatory confirmation
field for everyone. Explain any new staff burden and measure abandonment too.

Cradle builds the candidate and runs adjudicated historical/held-out replay and
effect-free shadow checks before a decision is needed. Compare identity correctness,
prohibited writes, total human minutes by role, repeated inputs, lead time and
cost. Eligible context changes can use a previously issued bounded low-risk
release grant; otherwise present the evaluated business change and burden for
adoption. Neither path permits nearest-match writes or authority expansion.
Independent verification, release identity and rollback bounds remain required.
Measure the same cohorts after adoption, including failed and incomplete intake;
recover the prior compatible release or rehearsed forward repair if the floor
regresses. Moving work to store staff is not a no-touch improvement.

## Proof required

The two distinct gates in [ACCEPTANCE.md](../ACCEPTANCE.md) require full traces.
For continuation, use paired cases with the same initial state and mandate but
changed later evidence, plus held-out changes not encoded as scenario-specific
routes. An independent reviewer specifies acceptable choices and verification
before running them. Record eligible actions, selected action and evidence,
plan revisions, outcome checks and budget use; show appropriate different choices
and successful resumption after restart. Report correct choices / all adjudicated
decision points, rejected/unsafe proposals, verified outcomes / all cases and
escalations. All safety checks must pass; task-specific quality floors are agreed
before evaluation, never invented after results. A fixed sequence passing only
its authored path does not meet the gate.

For improvement, prove a recurring exception/correction cohort produces a concrete
candidate, historical and held-out replay plus live shadow comparison, authorized
adoption, and post-change measurement and recovery rehearsal. Report negative and
inconclusive results too. The [operation scorecard](../PLAN.md#operation-scorecard)
feeds both loops; no current measured performance or improvement is asserted.
