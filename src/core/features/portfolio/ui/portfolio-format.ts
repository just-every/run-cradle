import type { CampaignSummary, Person } from "./portfolio-types";
import { formatWorkspaceMoney } from '../../../shared/workspace-money';

export const formatDate = (
  date: string,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  },
) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return date;
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(parsed);
};

export const formatDateTime = (value: string, timeZone: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
};

export const formatMoney = formatWorkspaceMoney;

export const healthLabel = (campaign: CampaignSummary) =>
  campaign.health === null
    ? "No health"
    : `${campaign.health}%${campaign.healthStale ? " · stale" : ""}`;

export const ownerLabel = (person: Person) =>
  `${person.name} (${person.initials})`;

/** CAMP-012: a compact campaign listing names the derived rating; None means no open risks. */
export const riskRatingLabel = (rating: string) =>
  rating === "None" ? "No open risks" : `${rating} risk`;

export const campaignHref = (campaignId: string) =>
  `/app/campaigns/${encodeURIComponent(campaignId)}`;
