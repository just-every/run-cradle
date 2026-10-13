import { campaignLifecycle } from '../../../../apps/launch/lifecycle'
import { RelatedRecords } from '../../../../ui/launch/related-records';
import { CampaignActions } from '../../../../ui/launch/campaign-actions';
import { useEffect, useState, type FormEvent } from "react";

import { ResourceBoundary } from "../../../app/ui/operator";

import {
  ApiError,
  decodeCampaignDetail,
  decodeCampaignMutation,
  decodeDeliverableMutation,
  requestJson,
  useApiResource,
} from "./portfolio-api";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  healthLabel,
} from "./portfolio-format";
import {
  ActivityList,
  CampaignHealth,
  PersonAvatar,
  SectionCard,
  StatusPill,
} from "./portfolio-presentation";
import { PortfolioPageShell, useOperatorSession } from "./portfolio-page-shell";
import type { CampaignDetail, Deliverable } from "./portfolio-types";

type CampaignDetailPageProps = { campaignId: string };
type EditValues = Pick<
  CampaignDetail,
  "name" | "phase" | "status" | "objective" | "summary"
>;

const readEditValues = (campaign: CampaignDetail): EditValues => ({
  name: campaign.name,
  phase: campaign.phase,
  status: campaign.status,
  objective: campaign.objective,
  summary: campaign.summary,
});

const MutationFailure = ({ error }: { error: ApiError | null }) =>
  error ? (
    <p className="portfolio-mutation-error" role="alert">
      {error.currentVersion
        ? `This campaign changed elsewhere (current version ${error.currentVersion}). Refresh the record before trying again.`
        : error.message}
    </p>
  ) : null;

const DetailContent = ({ campaignId }: CampaignDetailPageProps) => {
  const session = useOperatorSession();
  const detail = useApiResource(
    `/api/campaigns/${encodeURIComponent(campaignId)}`,
    decodeCampaignDetail,
  );
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<EditValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingDeliverableId, setTogglingDeliverableId] = useState<
    string | null
  >(null);
  const [mutationError, setMutationError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (detail.resource.state === "ready")
      setValues(readEditValues(detail.resource.data.campaign));
  }, [detail.resource]);

  if (session.resource.state !== "ready")
    return (
      <ResourceBoundary
        state={session.resource.state}
        operation="operator session"
        error={session.resource.error?.message}
        onRetry={session.retry}
      />
    );
  if (detail.resource.state !== "ready")
    return (
      <PortfolioPageShell
        currentPath={`/app/campaigns/${campaignId}`}
        title="Campaign detail"
        session={session.resource.data}
      >
        <ResourceBoundary
          state={detail.resource.state}
          operation="campaign detail"
          error={detail.resource.error?.message}
          onRetry={detail.retry}
        />
      </PortfolioPageShell>
    );

  const timezone = session.resource.data.workspace.timezone;
  const { campaign, deliverables, milestones, risks, decisions, activity } =
    detail.resource.data;
  const currentValues = values ?? readEditValues(campaign);
  const saveCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMutationError(null);
    try {
      await requestJson(
        `/api/campaigns/${encodeURIComponent(campaign.id)}`,
        decodeCampaignMutation,
        {
          method: "PATCH",
          body: JSON.stringify({ name: currentValues.name, objective: currentValues.objective, phase: currentValues.phase, status: currentValues.status, statusSummary: currentValues.summary, version: campaign.version }),
        },
      );
      setEditing(false);
      detail.retry();
    } catch (error) {
      setMutationError(
        error instanceof ApiError
          ? error
          : new ApiError({
              kind: "failed",
              status: 0,
              code: "campaign_update_failed",
              message: "The campaign could not be updated.",
            }),
      );
    } finally {
      setSaving(false);
    }
  };
  const toggleDeliverable = async (deliverable: Deliverable) => {
    setTogglingDeliverableId(deliverable.id);
    setMutationError(null);
    try {
      await requestJson(
        `/api/deliverables/${encodeURIComponent(deliverable.id)}/toggle-completion`,
        decodeDeliverableMutation,
        {
          method: "POST",
          body: JSON.stringify({ version: deliverable.version }),
        },
      );
      detail.retry();
    } catch (error) {
      setMutationError(
        error instanceof ApiError
          ? error
          : new ApiError({
              kind: "failed",
              status: 0,
              code: "deliverable_toggle_failed",
              message: "The deliverable could not be updated.",
            }),
      );
    } finally {
      setTogglingDeliverableId(null);
    }
  };

  return (
    <PortfolioPageShell
      currentPath={`/app/campaigns/${campaignId}`}
      title="Campaign detail"
      session={session.resource.data}
      actions={
        <>
          <a className="cr-button cr-button--quiet" href="/app/campaigns">
            Back to grid
          </a>
          <button
            className="cr-button"
            type="button"
            onClick={() => {
              setMutationError(null);
              setValues(readEditValues(campaign));
              setEditing(true);
            }}
          >
            Edit campaign
          </button>
        </>
      }
    >
      <div className="portfolio-page portfolio-detail-page">
        <section className="portfolio-detail-hero">
          <div>
            <p>{campaign.code}</p>
            <h2>{campaign.name}</h2>
            <span>
              {campaign.phase} · Launch {formatDate(campaign.launchDate)}
            </span>
            <div>
              <StatusPill>{campaign.status}</StatusPill>
              {campaign.riskRating !== "None" && <StatusPill>{campaign.riskRating} risk</StatusPill>}
            </div>
          </div>
          <CampaignHealth campaign={campaign} />
        </section>
        <MutationFailure error={mutationError} />
        {editing ? (
          <section className="portfolio-edit-panel">
            <header>
              <div>
                <p>Current version {campaign.version}</p>
                <h2>Edit campaign</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditing(false)}
                aria-label="Close campaign editor"
              >
                ×
              </button>
            </header>
            <form onSubmit={saveCampaign}>
              <label>
                Campaign name
                <input
                  required
                  value={currentValues.name}
                  onChange={(event) =>
                    setValues({ ...currentValues, name: event.target.value })
                  }
                />
              </label>
              <label>
                Phase
                <select
                  value={currentValues.phase}
                  onChange={(event) =>
                    setValues({ ...currentValues, phase: event.target.value })
                  }
                >
                  {campaignLifecycle.phases.map(value => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Status
                <select
                  value={currentValues.status}
                  onChange={(event) =>
                    setValues({ ...currentValues, status: event.target.value })
                  }
                >
                  {campaignLifecycle.statuses.map(value => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="portfolio-form-span">
                Objective
                <textarea
                  required
                  value={currentValues.objective}
                  onChange={(event) =>
                    setValues({
                      ...currentValues,
                      objective: event.target.value,
                    })
                  }
                />
              </label>
              <label className="portfolio-form-span">
                Status summary
                <textarea
                  required
                  maxLength={280}
                  value={currentValues.summary}
                  onChange={(event) =>
                    setValues({ ...currentValues, summary: event.target.value })
                  }
                />
              </label>
              <footer>
                <button
                  className="cr-button cr-button--quiet"
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button
                  className="cr-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </footer>
            </form>
          </section>
        ) : null}
        <section className="portfolio-detail-layout" aria-labelledby="campaign-work-title">
          <h2 id="campaign-work-title" className="portfolio-detail-work-title">Manage campaign work</h2>
          <div className="portfolio-detail-main">
            <SectionCard title="Campaign details" collapsible className="portfolio-priority-details">
              <div className="portfolio-detail-copy">
                <p>{campaign.objective}</p>
                <p>{campaign.summary}</p>
              </div>
              <dl className="portfolio-detail-facts">
                <div>
                  <dt>Owner</dt>
                  <dd>
                    <PersonAvatar person={campaign.owner} />
                  </dd>
                </div>
                <div>
                  <dt>Start date</dt>
                  <dd>{formatDate(campaign.startDate)}</dd>
                </div>
                <div>
                  <dt>Launch date</dt>
                  <dd>{formatDate(campaign.launchDate)}</dd>
                </div>
                <div>
                  <dt>Budget</dt>
                  <dd>
                    {formatMoney(
                      campaign.spendMinor,
                      session.resource.data.workspace.currency,
                    )}{" "}
                    spent of{" "}
                    {formatMoney(
                      campaign.budgetMinor,
                      session.resource.data.workspace.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Health</dt>
                  <dd>
                    {campaign.healthStale ? 'Needs refreshing' : healthLabel(campaign)}
                    {campaign.healthSetBy
                      ? ` · set by ${campaign.healthSetBy.name}`
                      : ""}
                    {campaign.healthSetAt ? ` · as of ${formatDateTime(campaign.healthSetAt, timezone)}` : " · date not recorded"}
                  </dd>
                </div>
              </dl>
            </SectionCard>
            <SectionCard title="Deliverables" className="portfolio-priority-work">
              <RelatedRecords kind="deliverable" campaignId={campaign.id} records={deliverables} onChanged={detail.retry} />
              <ul className="portfolio-deliverable-list">
                {deliverables.map((deliverable) => (
                  <li key={deliverable.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={deliverable.state === "Complete"}
                        disabled={togglingDeliverableId === deliverable.id}
                        onChange={() => toggleDeliverable(deliverable)}
                      />
                      <span>
                        <b>{deliverable.title}</b>
                        <small>
                          <PersonAvatar person={deliverable.owner} compact />
                          {deliverable.dueDate
                            ? ` · Due ${formatDate(deliverable.dueDate)}`
                            : ""}
                        </small>
                      </span>
                    </label>
                    {deliverable.overdue ? (
                      <StatusPill tone="overdue">Overdue</StatusPill>
                    ) : (
                      <StatusPill>{deliverable.state}</StatusPill>
                    )}
                  </li>
                ))}
              </ul>
              {deliverables.length === 0 ? (
                <p className="portfolio-empty-copy">
                  No deliverables are linked to this campaign.
                </p>
              ) : null}
            </SectionCard>
            <SectionCard title="Activity" collapsible className="portfolio-priority-history">
              <ActivityList timezone={session.resource.data.workspace.timezone} activity={activity} />
              {activity.length === 0 ? (
                <p className="portfolio-empty-copy">
                  No campaign activity has been recorded.
                </p>
              ) : null}
            </SectionCard>
          </div>
          <aside className="portfolio-detail-side">
            <SectionCard
              title="Milestones"
              className="portfolio-priority-milestones"
              action={<a href="/app/lenses/timeline">Timeline</a>}
            >
              <RelatedRecords kind="milestone" campaignId={campaign.id} records={milestones} onChanged={detail.retry} />
              <ol className="portfolio-detail-record-list">
                {milestones.map((milestone) => (
                  <li key={milestone.id}>
                    <div>
                      <strong>{milestone.title}</strong>
                      <span>
                        {milestone.type} · {formatDate(milestone.startDate)}{milestone.endDate ? ` – ${formatDate(milestone.endDate)}` : ''}
                      </span>
                    </div>
                    <StatusPill>{milestone.status}</StatusPill>
                  </li>
                ))}
              </ol>
              {milestones.length === 0 ? (
                <p className="portfolio-empty-copy">
                  No milestones are linked.
                </p>
              ) : null}
            </SectionCard>
            <SectionCard
              title="Open risks"
              className="portfolio-priority-risks"
              collapsible={risks.length === 0}
              action={<a href="/app/lenses/risks">Risks lens</a>}
            >
              <RelatedRecords kind="risk" campaignId={campaign.id} records={risks} onChanged={detail.retry} />
              <ol className="portfolio-risk-list">
                {risks.map((risk) => (
                  <li key={risk.id}>
                    <div>
                      <span>
                        <StatusPill>{risk.severity}</StatusPill>
                        <StatusPill>{risk.state}</StatusPill>
                      </span>
                      <strong>{risk.title}</strong>
                      <p>{risk.signal}</p>
                      <small>
                        {risk.dueDate
                          ? `Due ${formatDate(risk.dueDate)} · `
                          : ""}
                        {risk.owner.name}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
              {risks.length === 0 ? (
                <p className="portfolio-empty-copy">No risks are linked.</p>
              ) : null}
            </SectionCard>
            <SectionCard
              title="Unresolved decisions"
              className="portfolio-priority-decisions"
              collapsible={decisions.length === 0}
              action={<a href="/app/decisions">Decision queue</a>}
            >
              <ol className="portfolio-detail-record-list">
                {decisions.map((decision) => (
                  <li key={decision.id}>
                    <div>
                      <strong>{decision.title}</strong>
                      <span>
                        {decision.assignee?.name ?? decision.requester.name} ·
                        due {formatDateTime(decision.dueAt, timezone)}
                      </span>
                    </div>
                    <StatusPill>{decision.priority}</StatusPill>
                  </li>
                ))}
              </ol>
              {decisions.length === 0 ? (
                <p className="portfolio-empty-copy">
                  No unresolved decisions are linked.
                </p>
              ) : null}
            </SectionCard>
          </aside>
        </section>
<CampaignActions campaign={campaign} />
      </div>
    </PortfolioPageShell>
  );
};

export const CampaignDetailPage = ({ campaignId }: CampaignDetailPageProps) => (
  <DetailContent campaignId={campaignId} />
);
