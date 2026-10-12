# Cradle through eight user journeys

**Proposed experience, 27 September 2026.** All dialogue, names, amounts, counts
and status examples below are illustrative design copy, not customer evidence,
runtime data or implemented behavior. These journeys require the planned
[contract transition](contract-transition.md); current `AI-003` remains read-only.
Implementation starts with TanStack Start migration, then tangible owner-reviewed
12ui design and the early intelligent vertical in the [plan](../PLAN.md).

Cradle's default **Today** has **Needs your decision**, **Being handled** and
**Finished**. Nobody must check it every morning. Routine granted work is quiet;
meaningful nonurgent updates can be grouped at an optional cadence. Urgent
choices go once to the responsible person, with due/escalation reminders under
existing notification rules. Material outages remain visible; quiet operation
cannot suppress required critical alerts. Records, domain apps, search, edits
and saved lenses remain directly available. Chat is optional.

Every summary gives recommendation, status, impact, freshness and coverage,
important unknowns and next step. Open a case for reasons and evidence; technical
and authoring detail sits behind that. Exact spending, data egress, access changes
and new commitments belong beside authorization, never hidden in diagnostics.
Cradle fetches permitted facts, reuses answers and prepares the next step before
asking the smallest useful question of the person who knows.

## 1. Start with an outcome and real work

**Trigger and small action.** The owner says: “Keep refrigeration working across
our forty stores. Use our asset file and repair inbox. Ask our operations manager
above A$2,000; avoid visits during opening rush.” They select actual files and
authorize a read connection to the repair mailbox.

**Cradle does the preparation.** It identifies stores, assets, open requests and
contractor records; prepares schema, import mappings, roles, screens, measures
and checks; and shows useful cases from those sources. It pre-fills known rules,
flags conflicting evidence and asks only consequential missing business facts.
No model picker, grant matrix or evaluation dataset is the owner's homework.

**Unavoidable choice.** A prepared **How I'll handle this** card says: “I recommend
these approved contractors and this proposed monthly ceiling. I can request
quotes, book within your confirmed limits and chase progress. Quotes above
A$2,000 need the designated manager. Store staff must accept completed repairs.”
It shows exact proposed limits, expiry, who sees what, external recipients,
provider context and cost ceiling. **Authorize these limits / Change a rule**
activates only the confirmed authority; sensible suggestions begin inactive.
Separate provider consent, authentication or secrets go to the authorized person
when needed. Files and emails cannot authorize actions.

**Verified end and failure.** The candidate and mappings pass checks before
adoption. Source coverage is explicit: **Repair cases prepared; accounting not
connected—handoff unavailable**. The owner can use the prepared work while that
connection waits; setup is not falsely marked complete. Invalid imports remain
uncommitted under their existing preview rules. **Attention budget:** owner gives
intent, access and one meaningful authorization; source custodians supply only
missing access. Neither role repeatedly transcribes known facts.

## 2. Report a broken fridge once

**Trigger and small action.** A store employee opens the store's intake, attaches
a photo and writes “Fridge warm since this morning.” Known store, contact and
asset context are reused. The employee confirms the submission, not a long form.

**Cradle does the work.** It checks duplicates, resolves identity from authorized
records and evidence, checks warranty and eligible contractors, obtains comparable
quotes, books and follows up under actual grants. If identity remains ambiguous,
one prepared question goes to the store: “Is this the front display or the
stockroom unit? The photo and asset file disagree.” It does not guess an asset.
A quote below A$2,000 is not automatic permission: the commitment still needs the
right action, scope and available budget grant.

**Unavoidable choice.** After a contractor's completion claim, the employee
physically checks the fridge and chooses **Working—accept / Still faulty** against
that claim. Cradle cannot inspect the physical result on the employee's behalf.
“Still faulty” records evidence, reopens the case and starts permitted diagnostic
or rework steps; no accepted-completion invoice handoff proceeds.

**Verified end and failure.** **Accepted by store; handed to accounting** requires
both explicit acceptance and the accounting receipt. It never means **Paid**.
Offline, the photo and text show **Local draft—not submitted** if device storage
is available. Reconnect refreshes authority and versions, reconciles any earlier
unknown submission and asks for fresh confirmation; it never silently commits.
[Detailed disconnect/rejection cases](workflows.md#disconnected-and-delayed-submission)
remain required. **Attention budget:** one staff intake and one physical
acceptance for a successful visit, zero owner dispatch touches; contractor labor
and any accounting review still count. Rework and genuine ambiguity add visible
work rather than disappearing from the metric.

## 3. Make one prepared quote decision

**Trigger and small action.** The designated manager receives: **Decision needed:
A$2,450 to restore Store 18 cooling**. Opening it shows the exact quote/version,
contractor, scope, tax-inclusive total, exclusions and expiry.

**Cradle prepares the judgment.** “Recommend this repair: warranty evidence supports
the scope and the contractor can attend tomorrow. The alternative replacement
costs A$3,100 and arrives Friday. Decide by 3 pm to retain tomorrow's offered
slot; without approval I will not commit it.” Source dates, coverage and remaining
uncertainty are visible. The offered slot is not falsely shown as reserved.

**Unavoidable choice.** **Approve A$2,450 / Reject / Request change** records the
manager's exact decision and required rationale. The requester cannot self-approve
where separation of duties applies. The manager need not reconstruct the case
from emails or dispatch the contractor afterward.

**Verified end and failure.** Rejected or superseded quotes cannot be committed.
Cradle obtains permitted alternatives or a requested revision, carrying the
manager’s reason forward and returning only a materially new decision or a
prepared blocked case with impact and next step. The manager neither forwards
emails nor dispatches the contractor. Approval permits follow-through only after
current policy and quote checks. Cradle books, obtains the receipt and tracks completion,
store acceptance and accounting handoff. Silence is not approval: the offered
slot can expire, the case states its impact and the next check is scheduled.
A revised amount, scope, contractor or quote version invalidates the old approval;
a new prepared decision explains what changed. **Attention budget:** one manager
decision for the unchanged quote, no extra owner coordination. Store acceptance
and contractor work remain separately counted; changed terms legitimately need
another decision.

## 4. Discover a better way across stores

**Trigger and small action.** Related failures prompt Cradle to compare repairs,
replacement and a shared spare across the portfolio. The owner has not asked for
an optimizer or assembled a spreadsheet.

**Cradle investigates and builds.** It retrieves permitted warranty, compatibility,
stock and contractor evidence; evaluates whether additional investigation is
worth its delay and cost; performs authorized inquiries; and constructs and
independently checks the needed allocation tool. A prepared recommendation names
affected stores, exact proposed commitments, forecast downtime ranges, cash timing,
evidence coverage and unknowns. Conditional spare compatibility remains conditional.
The [worked portfolio example](frontier-direction.md#the-experience-forty-stores-one-business-decision)
illustrates the calculation, not measured savings.

**Choice only when needed.** Where actual existing grants and agreed objectives
cover the strategy, Cradle proceeds within those limits and reports meaningful
consequences without repeated owner acceptance. Only a changed tradeoff, new
authority or another genuinely required decision prompts: “Recommend moving the
compatible spare to Store A and repairing both units. This meets your confirmed
cash limit; these visits disrupt these stores.” The owner chooses **Accept strategy**
or changes a business constraint: “Keep Store B's opening day clear.” Cradle
recomputes and explains any infeasibility. The owner can open the operating map
or decision workbench, but need not continually operate either. An investigation outside existing
authority gets its own prepared cost/exposure decision.

**Verified end and failure.** Strategy acceptance creates no blanket purchasing
power. Jobs and reservations recheck actual grants and resource versions; quotes
above A$2,000 still need the manager, repairs need store acceptance. A spare
reserved elsewhere invalidates the recommendation before commitment. Receipts,
accepted repairs and observed costs/outages determine completion and later benefit.
**Attention budget:** owner supplies only a changed constraint or needed strategy
decision; Cradle does analysis, tool construction and coordination. Inspection,
manager and staff time remain in the comparison.

## 5. Recover quietly; escalate a meaningful stall

**Trigger and small action.** A booking provider accepts a request but its reply
is lost. Nobody is asked to press Retry.

**Cradle handles routine uncertainty.** It records **Unknown—checking booking**,
queries the provider using the original identity, finds the booking receipt and
continues. The case history remains inspectable, without an all-clear message
for every recovery or a daily owner check.

**Unavoidable choice when materially stalled.** A different case has no eligible
contractor before the cooling deadline. After checking authorized alternatives,
Cradle sends the operations manager: “Tomorrow's repair is blocked. Recommend
an eligible emergency visit at this quoted amount and scope; the cheaper option
leaves the fridge unavailable until Friday. Approve the emergency quote or change
the service constraint. Without an answer no booking will be made; next check
at 2 pm.” Actual amounts, decision deadline, evidence and impact accompany the
card. A connection outage goes to its custodian with the affected work and a
prepared reconnection step, not to every owner.

**Verified end and failure.** The chosen action is verified by provider receipts
and the normal repair end state. If the provider cannot establish whether it
booked, the outcome remains unknown and escalates by its deadline; it is never
retried as a known failure. **Correct / Pause / Take over** remain available.
Corrections invalidate dependent plans; pause stops new admissions within its
boundary, not already committed external actions. Cancellation/compensation needs
separate authority.

After reviewing Cradle’s prepared current scope and evidence, an authorized person
chooses **Resume with Cradle** to return a paused or taken-over case. Cradle
reconciles old attempts and in-flight effects, then revalidates evidence, versions,
grants and budgets before admitting new work. Unknown actions are never replayed.
A revoked or expired grant stays blocked until an authorized person explicitly
replaces it; resume cannot silently restore authority. Any remaining blocker
returns as a prepared decision; otherwise permitted work continues.
**Attention budget:** zero routine recovery touches; only the responsible manager,
custodian or operator handles a material unresolved choice.

## 6. Improve intake without creating staff homework

**Trigger and small action.** Repeated wrong-asset corrections prompt Cradle to
investigate. Staff continue normal work; the owner does not review prompts or
label a test dataset.

**Cradle diagnoses and evaluates.** It tests whether already-known asset facts,
better retrieval or narrower context fix the problem before proposing another
photo field. It prepares a candidate, adjudicated replay with held-out cases and
effect-free shadow checks. Independent verification checks correctness, authority,
latency, cost and human effort across roles, including abandoned intake.

**Unavoidable choice only when needed.** An eligible context improvement can
release under an existing bounded low-risk release grant with recorded evidence.
Otherwise the owner gets a prepared adoption decision: “These ambiguous cases
still need a serial-plate photo. Recommend asking only when existing evidence
cannot identify the asset. This adds staff work on those cases; here are the
measured evaluation results and remaining gaps.” **Adopt / Keep current / Change
rule** concerns the business effect, not model tuning. Already supplied photos
and answers are reused.

**Verified end and failure.** Post-release measurement must meet the agreed floor.
If correction or abandonment worsens, rollout stops and uses the rehearsed
compatible rollback or forward repair; external effects are not undone by reverting
code. Failed experiments remain visible. New access or egress cannot ride on the
release grant. **Attention budget:** no recurring owner evaluation task; one
adoption decision only outside granted bounds. Any added employee effort is
counted explicitly. Moving owner work to staff is not “no-touch.”

## 7. Prepare and run a launch

**Trigger and small action.** The launch owner supplies a brief, date and permitted
source files: “Launch the new service in October with these teams.”

**Cradle prepares.** In the proposed future authorized workflow, it builds a
campaign candidate, deliverables, dependencies, accountable people and a readiness
case. Known facts are prefilled; one consequential missing fact goes to its
responsible person. Campaign lists, milestone views, timelines, risks, decisions
and lenses remain first-class, directly editable manual tools.

**Unavoidable choice.** A blocked milestone produces: “Partner sign-off is missing.
Recommend moving this milestone after sign-off; this would delay readiness by
these dates. Approve the proposed change, request another plan or keep the date
with this unresolved risk.” Cradle gathers permitted evidence and prepares the
follow-through before asking. The appropriate people own the business decision
and any required launch approval.

**Verified end and failure.** Authorized changes recheck versions; accountable
people complete deliverables and Cradle checks readiness against current evidence.
Missing sign-off stays missing; an attractive summary cannot mark the launch
ready. Current `AI-003` prohibits agent writes and `CAMP-005` health semantics
remain binding until explicit accepted transitions. Readiness advice never quietly
approves or publishes a launch. **Attention budget:** owner provides intent and
material decisions; team members supply real deliverables and unavailable facts,
not duplicate status entry. Stale evidence reopens the readiness case with impact
and next step, while manual work stays usable during provider failure.

## 8. Add a different operation and preserve ownership

**Trigger and small action.** “Help us onboard suppliers, reusing approved supplier
identities from repairs.” This illustrative app is not the held-out third-app
acceptance proof; that still requires a fresh owner-chosen brief.

**Cradle prepares a useful candidate.** It infers records, roles, forms, workflow,
connections and checks from permitted materials. The owner reviews realistic
prepared work and corrects one business rule: “Finance confirms bank details;
store staff must never see them.” Cradle propagates the correction through screens,
server policy, imports, actions and checks, without repeating the question.

**Unavoidable choice.** The adoption preview names affected people and shared
entities, access changes, exact external costs and egress, migration effects,
in-flight work, recovery bounds and remaining uncertainty. **Adopt / Change rule /
Keep current** follows completed candidate evaluation and the release policy;
existing grants apply only where their scope genuinely covers the change.

**Verified end and failure.** Verify a useful onboarding workflow and governed
shared identity without inheriting repair access. Failed migration or permission
checks block adoption and leave current work intact. Direct source edits remain
possible and survive future generated changes and upstream adoption; migration
history is preserved. **Attention budget:** owner describes the outcome, corrects
business intent and authorizes consequential adoption; Cradle constructs, checks
and integrates. Finance performs genuine verification, counted as human work.
An app preview alone proves neither live readiness nor general-purpose authoring.

Measure all journeys with the [operation scorecard](../PLAN.md#operation-scorecard):
active minutes across roles, onboarding and physical work, repeated inputs,
context reconstruction and owner interruptions per verified outcome. Keep failed,
open, cancelled and abandoned cases visible. The existing 30% minimum hypothesis
and quality floors remain; none of these examples claims a numerical benefit.
