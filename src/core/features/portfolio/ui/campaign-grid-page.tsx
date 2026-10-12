import { CampaignInspector } from './campaign-inspector'
import { CampaignGridControls, queryLabels } from './campaign-grid-controls'
import { CreateCampaign } from '../../../../ui/launch/create-campaign';
import { useSearch } from '@tanstack/react-router';
import { parseCampaignQuery } from './campaign-query';
import { useEffect, useMemo, useState } from "react";

import { ResourceBoundary } from "../../../app/ui/operator";

import {
  campaignQueryUrl,
  decodeCampaignList,
  useApiResource,
} from "./portfolio-api";
import {
  formatDate,
  formatMoney,
} from "./portfolio-format";
import {
  CampaignLink,
  PersonAvatar,
  StatusPill,
} from "./portfolio-presentation";
import { PortfolioPageShell, useOperatorSession } from "./portfolio-page-shell";
import type { CampaignQuery } from "./portfolio-types";

const replaceGridQuery = (query: CampaignQuery) => {
  const next = new URL(window.location.href);
  next.search = campaignQueryUrl(query).split("?")[1] ?? "";
  window.history.replaceState(null, "", next);
};


const GridContent = () => {
  const [creating, setCreating] = useState(false);
  const session = useOperatorSession();
  const search = useSearch({ strict: false });
  const [query, setQuery] = useState<CampaignQuery>(() => parseCampaignQuery(search));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const campaigns = useApiResource(campaignQueryUrl(query), decodeCampaignList);
  const allCampaigns = useApiResource(campaignQueryUrl({ ...query, view: "all", phase: "", status: "" }), decodeCampaignList);

  useEffect(() => {
    replaceGridQuery(query);
  }, [query]);

  const selected = useMemo(
    () =>
      campaigns.resource.state === "ready"
        ? (campaigns.resource.data.items.find(
            (campaign) => campaign.id === selectedId,
          ) ?? null)
        : null,
    [campaigns.resource, selectedId],
  );
  const updateQuery = (patch: Partial<CampaignQuery>) => {
    setSelectedId(null);
    setQuery((current) => ({ ...current, ...patch }));
  };

  if (session.resource.state !== "ready")
    return (
      <ResourceBoundary
        state={session.resource.state}
        operation="operator session"
        error={session.resource.error?.message}
        onRetry={session.retry}
      />
    );
  const workspaceCurrency = session.resource.data.workspace.currency;
  return (
    <PortfolioPageShell
      currentPath="/app/campaigns"
      title="Campaign Grid"
      session={session.resource.data}
    >
      {creating ? <CreateCampaign currency={workspaceCurrency} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); campaigns.retry(); allCampaigns.retry(); }} /> : <button className="cr-button" onClick={() => setCreating(true)}>New campaign</button>}
      {!creating && <div
        className={`portfolio-grid-page${selected ? " portfolio-grid-page--inspecting" : ""}`}
      >
        <CampaignGridControls query={query} onChange={updateQuery} />
        {campaigns.resource.state !== "ready" ? (
          <ResourceBoundary
            state={campaigns.resource.state}
            operation="campaign grid"
            error={campaigns.resource.error?.message}
            onRetry={campaigns.retry}
          />
        ) : campaigns.resource.data.items.length === 0 ? (
          <ResourceBoundary
            state="empty"
            operation="campaigns"
            emptyTitle={allCampaigns.resource.state === "ready" && allCampaigns.resource.data.total === 0 ? "No campaigns yet" : "No campaigns match this view"}
            emptyDescription={allCampaigns.resource.state === "ready" && allCampaigns.resource.data.total === 0 ? "Choose New campaign to plan your first launch." : "Change the view, phase, or status to find your campaigns."}
          />
        ) : (
          <section className="portfolio-grid-workspace">
            <div className="portfolio-grid-results">
              <div className="portfolio-table-wrap">
                <table className="portfolio-campaign-table">
                  <caption>
                    {campaigns.resource.data.totalLabel} in {queryLabels[query.view]}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Campaign</th>
                      <th scope="col">Phase</th>
                      <th scope="col">Owner</th>
                      <th scope="col">Launch</th>
                      <th scope="col">Budget</th>
                      <th scope="col">Status</th>
                      <th scope="col">Risk</th>
                      <th scope="col">
                        <span className="sr-only">Inspect</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.resource.data.items.map((campaign) => (
                      <tr
                        key={campaign.id}
                        className={
                          selected?.id === campaign.id
                            ? "is-selected"
                            : undefined
                        }
                      >
                        <th scope="row">
                          <CampaignLink campaign={campaign} />
                        </th>
                        <td>{campaign.phase}</td>
                        <td>
                          <PersonAvatar person={campaign.owner} compact />
                        </td>
                        <td>
                          <time dateTime={campaign.launchDate}>
                            {formatDate(campaign.launchDate)}
                          </time>
                        </td>
                        <td>
                          {formatMoney(
                            campaign.budgetMinor,
                            workspaceCurrency,
                          )}
                        </td>
                        <td>
                          <StatusPill>{campaign.status}</StatusPill>
                        </td>
                        <td>
                          {campaign.riskRating === "None" ? <span>None</span> : <StatusPill>{campaign.riskRating}</StatusPill>}
                        </td>
                        <td>
                          <button
                            className="portfolio-inspect-button"
                            type="button"
                            onClick={() => setSelectedId(campaign.id)}
                            aria-label={`Inspect ${campaign.name}`}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul
                className="portfolio-campaign-cards"
                aria-label="Campaign cards"
              >
                {campaigns.resource.data.items.map((campaign) => (
                  <li
                    key={campaign.id}
                    className={
                      selected?.id === campaign.id ? "is-selected" : undefined
                    }
                  >
                    <div>
                      <CampaignLink campaign={campaign} />
                      <p>
                        {campaign.phase} · Launch{" "}
                        {formatDate(campaign.launchDate)}
                      </p>
                      <PersonAvatar person={campaign.owner} compact />
                    </div>
                    <div>
                      <StatusPill>{campaign.status}</StatusPill>
                      {campaign.riskRating === "None" ? <span>None</span> : <StatusPill>{campaign.riskRating}</StatusPill>}
                      <button
                        type="button"
                        onClick={() => setSelectedId(campaign.id)}
                      >
                        Inspect
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {selected ? (
              <CampaignInspector
                campaign={selected}
                currency={workspaceCurrency}
                onClose={() => setSelectedId(null)}
              />
            ) : null
            }
          </section>
        )}
      </div>}
    </PortfolioPageShell>
  );
};

export const CampaignGridPage = () => <GridContent />;
