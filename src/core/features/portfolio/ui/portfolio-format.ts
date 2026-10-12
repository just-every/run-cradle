import type { CampaignSummary, Person } from "./portfolio-types";

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

export const formatMoney = (amountMinor: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);

export const healthLabel = (campaign: CampaignSummary) =>
  campaign.health === null
    ? "No health"
    : `${campaign.health}%${campaign.healthStale ? " · stale" : ""}`;

export const ownerLabel = (person: Person) =>
  `${person.name} (${person.initials})`;

export const campaignHref = (campaignId: string) =>
  `/app/campaigns/${encodeURIComponent(campaignId)}`;
