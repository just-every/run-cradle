import { ResourceBoundary } from "../../../app/ui/operator";

import { decodePortfolio, useApiResource } from "./portfolio-api";
import {
  CampaignHealth,
  CampaignMiniList,
  MetricCard,
  MilestoneList,
  SectionCard,
} from "./portfolio-presentation";
import { PortfolioPageShell, useOperatorSession } from "./portfolio-page-shell";

export const PortfolioOverviewPage = () => {
  const session = useOperatorSession();
  const portfolio = useApiResource("/api/portfolio", decodePortfolio);

  if (session.resource.state !== "ready")
    return (
      <ResourceBoundary
        state={session.resource.state}
        operation="operator session"
        error={session.resource.error?.message}
        onRetry={session.retry}
      />
    );
  if (portfolio.resource.state !== "ready")
    return (
      <PortfolioPageShell
        currentPath="/app/overview"
        title="Portfolio Overview"
        session={session.resource.data}
      >
        <ResourceBoundary
          state={portfolio.resource.state}
          operation="portfolio overview"
          error={portfolio.resource.error?.message}
          onRetry={portfolio.retry}
        />
      </PortfolioPageShell>
    );

  const { metrics, attention, upcomingMilestones } = portfolio.resource.data;
  const workspace = session.resource.data.workspace;

  return (
    <PortfolioPageShell
      currentPath="/app/overview"
      title="Portfolio Overview"
      session={session.resource.data}
    >
      <div className="portfolio-page portfolio-overview">
        <section className="portfolio-overview-hero">
          <div>
            <p>Live operating picture</p>
            <h2>Portfolio health is a current rollup, not a weekly report.</h2>
          </div>
          <span>
            {metrics.staleHealthCount
              ? `${metrics.staleHealthCount} campaign health values are stale.`
              : "All visible health values are current."}
          </span>
        </section>
        <section
          className="portfolio-metric-grid"
          aria-label="Portfolio overview metrics"
        >
          <MetricCard label="Live campaigns" value={metrics.liveCampaigns} />
          <MetricCard label="Needs attention" value={metrics.needsAttention} />
          <MetricCard label="Open decisions" value={metrics.openDecisions} />
          <MetricCard
            label="Portfolio health"
            value={
              metrics.portfolioHealth === null
                ? "No data"
                : `${metrics.portfolioHealth}%`
            }
            note={
              metrics.staleHealthCount
                ? `${metrics.staleHealthCount} stale values`
                : "Across active campaigns"
            }
          />
        </section>
        <section className="portfolio-overview-grid">
          <SectionCard
            title="Campaigns needing attention"
            action={<a href="/app/campaigns?status=At%20risk">View grid</a>}
          >
            {attention.length ? (
              <CampaignMiniList
                campaigns={attention}
                currency={workspace.currency}
                description={(campaign) =>
                  `${campaign.riskRating} risk · ${campaign.deliverableComplete}/${campaign.deliverableTotal} deliverables complete`
                }
              />
            ) : (
              <p className="portfolio-empty-copy">
                No active campaign needs attention.
              </p>
            )}
          </SectionCard>
          <SectionCard
            title="Launch calendar"
            action={<a href="/app/lenses/timeline">Timeline lens</a>}
          >
            {upcomingMilestones.length ? (
              <MilestoneList milestones={upcomingMilestones} />
            ) : (
              <p className="portfolio-empty-copy">
                No scheduled launch milestones.
              </p>
            )}
          </SectionCard>
        </section>
        <SectionCard title="Attention health">
          {attention.length ? (
            <div className="portfolio-health-list">
              {attention.map((campaign) => (
                <article key={campaign.id}>
                  <a href={`/app/campaigns/${encodeURIComponent(campaign.id)}`}>
                    <strong>{campaign.name}</strong>
                    <span>
                      {campaign.code} · {campaign.phase}
                    </span>
                  </a>
                  <CampaignHealth campaign={campaign} />
                </article>
              ))}
            </div>
          ) : (
            <p className="portfolio-empty-copy">
              Campaign health will appear once active campaigns are recorded.
            </p>
          )}
        </SectionCard>
      </div>
    </PortfolioPageShell>
  );
};
