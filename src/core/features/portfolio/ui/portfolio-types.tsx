export type Person = {
  id: string;
  name: string;
  initials: string;
};

export type OperatorSession = {
  operator: Person & { email: string };
  workspace: { id: string; name: string; timezone: string; currency: string };
  unreadNotifications: number;
};

export type CampaignSummary = {
  id: string;
  code: string;
  name: string;
  owner: Person;
  phase: string;
  status: string;
  health: number | null;
  healthStale: boolean;
  startDate: string;
  launchDate: string;
  budgetMinor: number;
  spendMinor: number;
  riskRating: string;
  tags: string[];
  version: number;
  deliverableTotal: number;
  deliverableComplete: number;
  unresolvedDecisionCount: number;
};

export type PortfolioMetrics = {
  liveCampaigns: number;
  needsAttention: number;
  openDecisions: number;
  portfolioHealth: number | null;
  staleHealthCount: number;
};

export type ActivitySummary = {
  actionId?: string | null; type?: string; subjectId?: string; subjectTitle?: string | null; fieldName?: string | null; previousValue?: string | null; nextValue?: string | null;
  id: string;
  description: string;
  occurredAt: string;
  actor: Person | null;
};

export type PortfolioResponse = {
  metrics: PortfolioMetrics;
  attention: CampaignSummary[];
  upcomingMilestones: MilestoneSummary[];
  recentActivity: ActivitySummary[];
};

export type CampaignListResponse = {
  items: CampaignSummary[];
  total: number;
  totalLabel: string;
  cursor: string | null;
};

export type Deliverable = {
  id: string;
  title: string;
  owner: Person;
  dueDate: string | null;
  state: "Open" | "Complete";
  overdue: boolean;
  version: number;
};

export type MilestoneSummary = {
  id: string;
  title: string;
  owner: Person;
  type: string;
  status: string;
  startDate: string;
  endDate: string | null;
  overdue: boolean;
  dependencyConflict: boolean;
  version: number;
};

export type RiskSummary = {
  id: string;
  title: string;
  severity: string;
  state: string;
  owner: Person;
  dueDate: string | null;
  signal: string;
  mitigation: string;
  version: number;
};

export type DecisionSummary = {
  id: string;
  title: string;
  priority: string;
  state: string;
  dueAt: string;
  requester: Person;
  assignee: Person | null;
  version: number;
};

export type CampaignDetail = CampaignSummary & {
  objective: string;
  summary: string;
  healthSetBy: Person | null;
  healthSetAt: string | null;
};

export type CampaignDetailResponse = {
  campaign: CampaignDetail;
  deliverables: Deliverable[];
  milestones: MilestoneSummary[];
  risks: RiskSummary[];
  decisions: DecisionSummary[];
  activity: ActivitySummary[];
  customFields: CampaignCustomField[];
};

export type CampaignCustomField = { id: string; name: string; type: string; options: string[]; value: string | boolean | string[] | null };

export type CampaignGroup = "none" | "phase" | "status" | "owner";
export type CampaignField = "phase" | "owner" | "launchDate" | "budget" | "status" | "risk";
export type CampaignQuery = {
  view: "all" | "launch-prep" | "mine";
  phase: string;
  status: string;
  group: CampaignGroup;
  sort: "launchDate" | "name" | "health";
  direction: "asc" | "desc";
  /** Grid columns the operator chose to show; presentation only, never sent to the API. */
  fields: CampaignField[];
};
