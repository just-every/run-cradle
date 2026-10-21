import { Fragment } from "react";

import { formatDate, formatMoney } from "./portfolio-format";
import { CampaignLink, PersonAvatar, StatusPill } from "./portfolio-presentation";
import type { CampaignField, CampaignGroup, CampaignSummary } from "./portfolio-types";

type Selection = {
  selectedId: string | null;
  chosen: Map<string, number>;
  toggle: (id: string, version: number, on: boolean) => void;
  onInspect: (id: string) => void;
};
type Results = Selection & {
  campaigns: CampaignSummary[];
  group: CampaignGroup;
  fields: CampaignField[];
  currency: string;
};

/** Consecutive campaigns sharing a group value. The API orders a grouped query by group
 * first, so each group arrives together and a page continues the last group. */
function grouped(campaigns: CampaignSummary[], group: CampaignGroup) {
  if (group === "none") return [{ key: "all", label: null, items: campaigns }];
  const groups: { key: string; label: string | null; items: CampaignSummary[] }[] = [];
  for (const campaign of campaigns) {
    const key = group === "owner" ? campaign.owner.id : campaign[group];
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(campaign);
    else groups.push({ key, label: group === "owner" ? campaign.owner.name : campaign[group], items: [campaign] });
  }
  return groups;
}
const shown = (count: number) => `${count} ${count === 1 ? "campaign" : "campaigns"}`;
const risk = (campaign: CampaignSummary) => campaign.riskRating === "None" ? <span>None</span> : <StatusPill>{campaign.riskRating}</StatusPill>;

export function CampaignTable({ campaigns, group, fields, currency, selectedId, chosen, toggle, onInspect, caption, pageChosen, choosePage }: Results & {
  caption: string;
  pageChosen: boolean;
  choosePage: (on: boolean) => void;
}) {
  const visible = (field: CampaignField) => fields.includes(field);
  return (
    <table className="portfolio-campaign-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="launch-select-cell"><input type="checkbox" aria-label="Select every campaign on this page" checked={pageChosen} onChange={(event) => choosePage(event.target.checked)} /></th>
          <th scope="col">Campaign</th>
          {visible("phase") && <th scope="col">Phase</th>}
          {visible("owner") && <th scope="col">Owner</th>}
          {visible("launchDate") && <th scope="col">Launch</th>}
          {visible("budget") && <th scope="col">Budget</th>}
          {visible("status") && <th scope="col">Status</th>}
          {visible("risk") && <th scope="col">Risk</th>}
          <th scope="col">
            <span className="sr-only">Inspect</span>
          </th>
        </tr>
      </thead>
      {grouped(campaigns, group).map((section) => (
        <tbody key={section.key}>
          {section.label !== null && (
            <tr className="portfolio-group-row">
              <th scope="rowgroup" colSpan={fields.length + 3}>{section.label} <span>· {shown(section.items.length)}</span></th>
            </tr>
          )}
          {section.items.map((campaign) => (
            <tr key={campaign.id} className={selectedId === campaign.id ? "is-selected" : undefined}>
              <td className="launch-select-cell"><input type="checkbox" aria-label={`Select ${campaign.name}`} checked={chosen.has(campaign.id)} onChange={(event) => toggle(campaign.id, campaign.version, event.target.checked)} /></td>
              <th scope="row">
                <CampaignLink campaign={campaign} />
              </th>
              {visible("phase") && <td>{campaign.phase}</td>}
              {visible("owner") && <td><PersonAvatar person={campaign.owner} compact /></td>}
              {visible("launchDate") && <td><time dateTime={campaign.launchDate}>{formatDate(campaign.launchDate)}</time></td>}
              {visible("budget") && <td>{formatMoney(campaign.budgetMinor, currency)}</td>}
              {visible("status") && <td><StatusPill>{campaign.status}</StatusPill></td>}
              {visible("risk") && <td>{risk(campaign)}</td>}
              <td>
                <button className="portfolio-inspect-button" type="button" onClick={() => onInspect(campaign.id)} aria-label={`Inspect ${campaign.name}`}>
                  Inspect
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}

export function CampaignCards({ campaigns, group, fields, currency, selectedId, chosen, toggle, onInspect }: Results) {
  const visible = (field: CampaignField) => fields.includes(field);
  return (
    <ul className="portfolio-campaign-cards" aria-label="Campaign cards">
      {grouped(campaigns, group).map((section) => (
        <Fragment key={section.key}>
          {section.label !== null && <li className="portfolio-card-group"><h3>{section.label} <span>· {shown(section.items.length)}</span></h3></li>}
          {section.items.map((campaign) => (
            <li key={campaign.id} className={selectedId === campaign.id ? "is-selected" : undefined}>
              <div>
                <label className="launch-card-select"><input type="checkbox" checked={chosen.has(campaign.id)} onChange={(event) => toggle(campaign.id, campaign.version, event.target.checked)} /><span className="sr-only">Select {campaign.name}</span></label>
                <CampaignLink campaign={campaign} />
                {(visible("phase") || visible("launchDate")) && (
                  <p>
                    {visible("phase") && campaign.phase}
                    {visible("phase") && visible("launchDate") && " · "}
                    {visible("launchDate") && <>Launch {formatDate(campaign.launchDate)}</>}
                  </p>
                )}
                {visible("budget") && <p>Budget {formatMoney(campaign.budgetMinor, currency)}</p>}
                {visible("owner") && <PersonAvatar person={campaign.owner} compact />}
              </div>
              <div>
                {visible("status") && <StatusPill>{campaign.status}</StatusPill>}
                {visible("risk") && risk(campaign)}
                <button type="button" onClick={() => onInspect(campaign.id)}>
                  Inspect
                </button>
              </div>
            </li>
          ))}
        </Fragment>
      ))}
    </ul>
  );
}
