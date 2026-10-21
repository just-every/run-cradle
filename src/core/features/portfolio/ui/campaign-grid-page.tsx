import { CampaignInspector } from './campaign-inspector'
import { CampaignMoneyTotals } from './campaign-money-totals'
import { CampaignGridControls, queryLabels } from './campaign-grid-controls'
import { campaignGridSearch } from './campaign-grid-fields'
import { CampaignCards, CampaignTable } from './campaign-grid-results'
import { CreateCampaign } from '../../../../ui/launch/create-campaign';
import { ImportLaunchCsv } from '../../../../ui/launch/import-launch-csv';
import { ExportLaunchCsv } from '../../../../ui/launch/export-launch-csv';
import { BulkCampaigns } from '../../../../ui/launch/bulk-campaigns';
import { selectAllMatching } from '../../../../ui/launch/select-matching';
import '../../../../ui/launch/launch-operator.css';
import { useSearch } from '@tanstack/react-router';
import { parseCampaignQuery } from './campaign-query';
import { useEffect, useMemo, useState } from "react";

import { ResourceBoundary } from "../../../app/ui/operator";

import {
  campaignQueryUrl,
  decodeCampaignList,
  useApiResource,
} from "./portfolio-api";
import { PortfolioPageShell, useOperatorSession } from "./portfolio-page-shell";
import type { CampaignQuery } from "./portfolio-types";

const replaceGridQuery = (query: CampaignQuery) => {
  const next = new URL(window.location.href);
  next.search = campaignGridSearch(campaignQueryUrl(query), query);
  window.history.replaceState(null, "", next);
};


const GridContent = () => {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [chosen, setChosen] = useState<Map<string, number>>(new Map());
  const [selecting, setSelecting] = useState('');
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
    setChosen(new Map());
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
  const refresh = () => { setChosen(new Map()); campaigns.retry(); allCampaigns.retry(); };
  const toggle = (id: string, version: number, on: boolean) => setChosen((current) => { const next = new Map(current); if (on) next.set(id, version); else next.delete(id); return next; });
  const pageItems = campaigns.resource.state === "ready" ? campaigns.resource.data.items : [];
  const pageChosen = pageItems.length > 0 && pageItems.every((campaign) => chosen.has(campaign.id));
  const matching = campaigns.resource.state === "ready" ? campaigns.resource.data.total : 0;
  const results = { campaigns: pageItems, group: query.group, fields: query.fields, currency: workspaceCurrency, selectedId: selected?.id ?? null, chosen, toggle, onInspect: setSelectedId };
  const chooseAll = async () => { setSelecting(''); try { setChosen(new Map((await selectAllMatching(campaignQueryUrl(query))).map((item) => [item.id, item.version]))); } catch (cause) { setSelecting(cause instanceof Error ? cause.message : 'Could not select every match.'); } };
  return (
    <PortfolioPageShell
      currentPath="/app/campaigns"
      title="Campaign Grid"
      session={session.resource.data}
    >
      {creating ? <CreateCampaign currency={workspaceCurrency} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refresh(); }} /> : importing ? <ImportLaunchCsv onClose={() => setImporting(false)} onImported={refresh} /> : <div className="launch-grid-actions"><button className="cr-button" onClick={() => setCreating(true)}>New campaign</button><button type="button" className="cr-button cr-button--quiet" onClick={() => setImporting(true)}>Import CSV</button><ExportLaunchCsv params={{ source: "grid", view: query.view, phase: query.phase, status: query.status, sort: query.sort, direction: query.direction }} /></div>}
      {!creating && !importing && <div
        className={`portfolio-grid-page${selected ? " portfolio-grid-page--inspecting" : ""}`}
      >
        <CampaignGridControls query={query} onChange={updateQuery} />
        <div className="launch-grid-selection">
          <BulkCampaigns selected={[...chosen].map(([id, version]) => ({ id, version }))} onClear={() => setChosen(new Map())} onChanged={refresh} />
          {chosen.size > 0 && chosen.size < Math.min(matching, 500) && <p className="launch-select-all"><button type="button" className="cr-link-button" onClick={() => void chooseAll()}>Select all {Math.min(matching, 500)} matching campaigns</button>{matching > 500 ? " (bulk edits take up to 500 at once)" : ""}</p>}
          {selecting && <p role="alert" className="cr-error">{selecting}</p>}
        </div>
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
              <CampaignMoneyTotals campaigns={pageItems} currency={workspaceCurrency} />
              <div className="portfolio-table-wrap">
                <CampaignTable {...results} caption={`${campaigns.resource.data.totalLabel} in ${queryLabels[query.view]}`} pageChosen={pageChosen} choosePage={(on) => setChosen((current) => { const next = new Map(current); for (const campaign of pageItems) { if (on) next.set(campaign.id, campaign.version); else next.delete(campaign.id); } return next; })} />
              </div>
              <CampaignCards {...results} />
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
