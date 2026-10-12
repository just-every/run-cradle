import { activityActions, activityFieldLabel, activityValue } from './activity-presentation'
import type { PropsWithChildren, ReactNode } from "react";

import {
  campaignHref,
  formatDate,
  formatDateTime,
  formatMoney,
  healthLabel,
} from "./portfolio-format";
import type {
  ActivitySummary,
  CampaignSummary,
  MilestoneSummary,
  Person,
} from "./portfolio-types";

export const StatusPill = ({
  children,
  tone,
}: PropsWithChildren<{ tone?: string }>) => (
  <span
    className={`portfolio-pill portfolio-pill--${tone ?? String(children).toLowerCase().replace(/\s+/g, "-")}`}
  >
    {children}
  </span>
);

export const PersonAvatar = ({
  person,
  compact = false,
}: {
  person: Person;
  compact?: boolean;
}) => (
  <span
    className={`portfolio-person${compact ? " portfolio-person--compact" : ""}`}
    title={person.name}
    role={compact ? "img" : undefined}
    aria-label={compact ? person.name : undefined}
  >
    <span aria-hidden="true">{person.initials}</span>
    {compact ? null : <b>{person.name}</b>}
  </span>
);

export const CampaignLink = ({
  campaign,
  className,
}: {
  campaign: CampaignSummary;
  className?: string;
}) => (
  <a className={className} href={campaignHref(campaign.id)}>
    <strong>{campaign.name}</strong>
    <small>{campaign.code}</small>
  </a>
);

export const MetricCard = ({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) => (
  <article className="portfolio-metric">
    <p>{label}</p>
    <strong>{value}</strong>
    {note ? <small>{note}</small> : null}
  </article>
);

export const SectionCard = ({ title, action, children, className, collapsible = false }: PropsWithChildren<{ title: string; action?: ReactNode; className?: string; collapsible?: boolean }>) => collapsible ? (
  <details className={`portfolio-section-card portfolio-collapsible${className ? ` ${className}` : ''}`}><summary><h2>{title}</h2></summary>{action && <div className="portfolio-section-action">{action}</div>}{children}</details>
) : (
  <section className={`portfolio-section-card${className ? ` ${className}` : ''}`}><header><h2>{title}</h2>{action}</header>{children}</section>
);

export const ActivityList = ({ activity, timezone }: { activity: ActivitySummary[]; timezone: string }) => (
  <ol className="portfolio-activity-list">
    {activityActions(activity).map((entry) => (
      <li key={entry.id}>
        <span className="portfolio-activity-dot" aria-hidden="true" />
        <div>
          <p>
            {entry.actor ? (
              <>
                <b>{entry.actor.name}</b> {entry.description}
              </>
            ) : (
              entry.description
            )}
          </p>
          <time dateTime={entry.occurredAt}>
            {formatDateTime(entry.occurredAt, timezone)}
          </time>
          {entry.facts.some(fact => fact.fieldName) && <details><summary>Change details</summary><dl>{entry.facts.filter(fact => fact.fieldName).map(fact => <div key={fact.id}><dt>{activityFieldLabel(fact.fieldName!)}</dt><dd>{activityValue(fact.fieldName!, fact.previousValue, timezone)} → {activityValue(fact.fieldName!, fact.nextValue, timezone)}</dd></div>)}</dl></details>}
        </div>
      </li>
    ))}
  </ol>
);

export const MilestoneList = ({
  milestones,
}: {
  milestones: MilestoneSummary[];
}) => (
  <ol className="portfolio-milestone-list">
    {milestones.map((milestone) => (
      <li key={milestone.id}>
        <time dateTime={milestone.startDate}>
          {formatDate(milestone.startDate, { month: "short", day: "numeric" })}
        </time>
        <div>
          <strong>{milestone.title}</strong>
          <span>
            {milestone.type} · <PersonAvatar person={milestone.owner} compact />
          </span>
        </div>
        <div>
          {milestone.dependencyConflict ? (
            <StatusPill tone="conflict">Dependency conflict</StatusPill>
          ) : null}
          {milestone.overdue ? (
            <StatusPill tone="overdue">Overdue</StatusPill>
          ) : (
            <StatusPill>{milestone.status}</StatusPill>
          )}
        </div>
      </li>
    ))}
  </ol>
);

export const CampaignMiniList = ({
  campaigns,
  currency,
  description,
}: {
  campaigns: CampaignSummary[];
  currency: string;
  description?: (campaign: CampaignSummary) => string;
}) => (
  <ul className="portfolio-campaign-mini-list">
    {campaigns.map((campaign) => (
      <li key={campaign.id}>
        <div>
          <CampaignLink campaign={campaign} />
          <p>
            {description
              ? description(campaign)
              : `${campaign.phase} · Launch ${formatDate(campaign.launchDate)}`}
          </p>
        </div>
        <div>
          <StatusPill>{campaign.status}</StatusPill>
          <span>{formatMoney(campaign.budgetMinor, currency)}</span>
        </div>
      </li>
    ))}
  </ul>
);

export const CampaignHealth = ({ campaign }: { campaign: CampaignSummary }) => (
  <div role="group" className={`portfolio-health${campaign.healthStale ? ' portfolio-health--stale' : ''}`} aria-label={`${campaign.name} manually reported health ${healthLabel(campaign)}`}>
    {campaign.healthStale ? <><strong>Health needs refreshing</strong><small>Previously reported: {campaign.health === null ? 'not recorded' : `${campaign.health}%`}</small></> : <><div><span>Reported health</span><b>{campaign.health === null ? 'Not recorded' : `${campaign.health}%`}</b></div>{campaign.health !== null && <div className="portfolio-health-track"><i style={{ width: `${campaign.health}%` }} /></div>}</>}
  </div>
);
