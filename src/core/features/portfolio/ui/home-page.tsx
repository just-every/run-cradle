import { Link } from '@tanstack/react-router'
import "./home-page.css";
import { CradleArt } from "../../../../ui/shared/cradle-art";
import { ResourceBoundary } from "../../../app/ui/operator";

import { decodePortfolio, useApiResource } from "./portfolio-api";
import {
  CampaignMiniList,
  MetricCard,
  MilestoneList,
  SectionCard,
  ActivityList,
} from "./portfolio-presentation";
import { PortfolioPageShell, useOperatorSession } from "./portfolio-page-shell";

const SessionFailure = ({
  state,
  error,
  retry,
}: {
  state: "loading" | "signed-out" | "not-found" | "failed" | "forbidden";
  error?: string;
  retry: () => void;
}) => (
  <ResourceBoundary
    state={state}
    operation="operator session"
    error={error}
    onRetry={retry}
  />
);

const HomeContent = () => {
  const session = useOperatorSession();
  const portfolio = useApiResource("/api/portfolio", decodePortfolio);

  if (session.resource.state !== "ready")
    return (
      <SessionFailure
        state={session.resource.state}
        error={session.resource.error?.message}
        retry={session.retry}
      />
    );
  const workspace = session.resource.data.workspace;
  if (portfolio.resource.state !== "ready")
    return (
      <PortfolioPageShell
        currentPath="/app"
        title="Home"
        session={session.resource.data}
      >
        {portfolio.resource.state !== "forbidden" && <RecordsIntro />}
        <ResourceBoundary
          state={portfolio.resource.state}
          operation="workspace home"
          error={portfolio.resource.error?.message}
          onRetry={portfolio.retry}
          actions={portfolio.resource.state === "forbidden" ? <a className="cr-button" href="/app/records">Open records</a> : undefined}
        />
      </PortfolioPageShell>
    );

  const { metrics, attention, upcomingMilestones, recentActivity } =
    portfolio.resource.data;
  const empty =
    metrics.liveCampaigns === 0 &&
    attention.length === 0 &&
    upcomingMilestones.length === 0 &&
    recentActivity.length === 0;

  return (
    <PortfolioPageShell
      currentPath="/app"
      title="Home"
      session={session.resource.data}
    >
      <RecordsIntro />
      {!empty && (
        <div className="portfolio-page portfolio-home">
          <section className="portfolio-home-intro">
            <p>Launch readiness template</p>
            <h2>Keep the launch work that needs attention in reach.</h2>
            <span>Current counts and activity from {workspace.name}.</span>
          </section>
          <section
            className="portfolio-metric-grid"
            aria-label="Portfolio metrics"
          >
            <MetricCard label="Live campaigns" value={metrics.liveCampaigns} />
            <MetricCard
              label="Needs attention"
              value={metrics.needsAttention}
            />
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
                  ? `${metrics.staleHealthCount} stale`
                  : "Current"
              }
            />
          </section>
          <section className="portfolio-home-grid">
            <SectionCard
              title="Needs attention"
              action={<Link to="/app/campaigns">Open campaign grid</Link>}
            >
              {attention.length ? (
                <CampaignMiniList
                  campaigns={attention}
                  currency={workspace.currency}
                  description={(campaign) =>
                    `${campaign.riskRating} risk · ${campaign.unresolvedDecisionCount} unresolved decisions`
                  }
                />
              ) : (
                <p className="portfolio-empty-copy">
                  No active campaign needs attention.
                </p>
              )}
            </SectionCard>
            <SectionCard
              title="Upcoming milestones"
              action={<Link to="/app/lenses/timeline">Open timeline</Link>}
            >
              {upcomingMilestones.length ? (
                <MilestoneList milestones={upcomingMilestones} />
              ) : (
                <p className="portfolio-empty-copy">No upcoming milestones.</p>
              )}
            </SectionCard>
          </section>
          <SectionCard
            title="Recent activity"
            action={<Link to="/app/campaigns">Campaign grid</Link>}
          >
            {recentActivity.length ? (
              <ActivityList timezone={workspace.timezone} activity={recentActivity} />
            ) : (
              <p className="portfolio-empty-copy">
                No activity has been recorded.
              </p>
            )}
          </SectionCard>
        </div>
      )}
    </PortfolioPageShell>
  );
};

export const HomePage = () => <HomeContent />;

function RecordsIntro() {
  return <section className="cr-page cr-home-records"><div className="cr-card cr-welcome"><div className="cr-welcome-copy"><p className="cr-eyebrow">Records builder</p><h2>Your business, organised your way.</h2><p>Start from a template or build your own tables and fields in Records. Then add your records, connect them and choose a view.</p><div className="cr-actions"><a className="cr-button" href="/app/records">Open records</a><a className="cr-button cr-button--quiet" href="/app/records/?import=base">Import a base</a></div><p className="cr-welcome-hint">Choose Create base to build your own, or browse the editable templates.</p></div><div className="cr-welcome-art"><CradleArt variant="welcome" /></div></div></section>
}
