import { sessionFetch } from '../../../../ui/shared/session-fetch'
import { useRef } from 'react'
import { useDocumentData } from '../../../app/document-data';
import { useDocumentSession } from '../../../app/document-context';
import { useCallback, useEffect, useState } from "react";

import type {
  ActivitySummary,
  CampaignDetail,
  CampaignDetailResponse,
  CampaignListResponse,
  CampaignQuery,
  CampaignSummary,
  DecisionSummary,
  Deliverable,
  MilestoneSummary,
  OperatorSession,
  Person,
  PortfolioMetrics,
  PortfolioResponse,
  RiskSummary,
} from "./portfolio-types";

export type ApiErrorKind = "signed-out" | "not-found" | "forbidden" | "failed";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly currentVersion: number | null;

  constructor({
    kind,
    status,
    code,
    message,
    currentVersion,
  }: {
    kind: ApiErrorKind;
    status: number;
    code: string;
    message: string;
    currentVersion?: number | null;
  }) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.currentVersion = currentVersion ?? null;
  }
}

export type ApiResource<T> =
  | { state: "loading"; data: null; error: null }
  | { state: "ready"; data: T; error: null }
  | {
      state: "signed-out" | "not-found" | "forbidden" | "failed";
      data: null;
      error: ApiError;
    };

type JsonRecord = Record<string, unknown>;
type Decoder<T> = (value: unknown) => T;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const fieldKey = (field: string) => field.slice(field.lastIndexOf(".") + 1);
const requiredRecord = (value: unknown, field: string): JsonRecord => {
  if (!isRecord(value))
    throw new Error(`API response field ${field} must be an object.`);
  return value;
};
const requiredText = (record: JsonRecord, field: string) => {
  const value = record[fieldKey(field)];
  if (typeof value !== "string")
    throw new Error(`API response field ${field} must be a string.`);
  return value;
};
const requiredString = (record: JsonRecord, field: string) => {
  const value = requiredText(record, field);
  if (typeof value !== "string" || !value.trim())
    throw new Error(`API response field ${field} must be a non-empty string.`);
  return value;
};
const requiredNumber = (record: JsonRecord, field: string) => {
  const value = record[fieldKey(field)];
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`API response field ${field} must be a finite number.`);
  return value;
};
const requiredBoolean = (record: JsonRecord, field: string) => {
  const value = record[fieldKey(field)];
  if (typeof value !== "boolean")
    throw new Error(`API response field ${field} must be a boolean.`);
  return value;
};
const requiredNullableNumber = (record: JsonRecord, field: string) => {
  const value = record[fieldKey(field)];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(
      `API response field ${field} must be a finite number or null.`,
    );
  return value;
};
const requiredNullableString = (record: JsonRecord, field: string) => {
  const value = record[fieldKey(field)];
  if (value === null) return null;
  if (typeof value !== "string")
    throw new Error(`API response field ${field} must be a string or null.`);
  return value;
};
const optionalString = (record: JsonRecord, field: string) => {
  const value = record[fieldKey(field)];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string")
    throw new Error(
      `API response field ${field} must be a string when present.`,
    );
  return value;
};
const optionalRecord = (record: JsonRecord, field: string) => {
  const value = record[fieldKey(field)];
  if (value === null || value === undefined) return null;
  return requiredRecord(value, field);
};
const requiredArray = (record: JsonRecord, field: string) => {
  const value = record[fieldKey(field)];
  if (!Array.isArray(value))
    throw new Error(`API response field ${field} must be an array.`);
  return value;
};

const decodePerson = (value: unknown, field: string): Person => {
  const record = requiredRecord(value, field);
  return {
    id: requiredString(record, `${field}.id`),
    name: requiredString(record, `${field}.name`),
    initials: requiredString(record, `${field}.initials`),
  };
};

const decodeCampaignSummary = (value: unknown): CampaignSummary => {
  const record = requiredRecord(value, "campaign");
  const tags = requiredArray(record, "campaign.tags");
  if (!tags.every((tag) => typeof tag === "string"))
    throw new Error(
      "API response field campaign.tags must contain only strings.",
    );
  const health = requiredNullableNumber(record, "campaign.health");
  return {
    id: requiredString(record, "campaign.id"),
    code: requiredString(record, "campaign.code"),
    name: requiredString(record, "campaign.name"),
    owner: decodePerson(record.owner, "campaign.owner"),
    phase: requiredString(record, "campaign.phase"),
    status: requiredString(record, "campaign.status"),
    health,
    healthStale: requiredBoolean(record, "campaign.healthStale"),
    startDate: requiredString(record, "campaign.startDate"),
    launchDate: requiredString(record, "campaign.launchDate"),
    budgetMinor: requiredNumber(record, "campaign.budgetMinor"),
    spendMinor: requiredNumber(record, "campaign.spendMinor"),
    riskRating: requiredString(record, "campaign.riskRating"),
    tags,
    version: requiredNumber(record, "campaign.version"),
    deliverableTotal: requiredNumber(record, "campaign.deliverableTotal"),
    deliverableComplete: requiredNumber(record, "campaign.deliverableComplete"),
    unresolvedDecisionCount: requiredNumber(
      record,
      "campaign.unresolvedDecisionCount",
    ),
  };
};

const decodeActivity = (value: unknown): ActivitySummary => {
  const record = requiredRecord(value, "activity");
  return {
    id: requiredString(record, "activity.id"),
    actionId: optionalString(record, "actionId"), type: optionalString(record, "type") ?? undefined, subjectId: optionalString(record, "subjectId") ?? undefined, subjectTitle: optionalString(record, "subjectTitle") ?? undefined, fieldName: optionalString(record, "fieldName"), previousValue: optionalString(record, "previousValue"), nextValue: optionalString(record, "nextValue"),
    description: requiredString(record, "activity.description"),
    occurredAt: requiredString(record, "activity.occurredAt"),
    actor: optionalRecord(record, "activity.actor")
      ? decodePerson(record.actor, "activity.actor")
      : null,
  };
};

const decodeMilestone = (value: unknown): MilestoneSummary => {
  const record = requiredRecord(value, "milestone");
  return {
    id: requiredString(record, "milestone.id"),
    title: requiredString(record, "milestone.title"),
    owner: decodePerson(record.owner, "milestone.owner"),
    type: requiredString(record, "milestone.type"),
    status: requiredString(record, "milestone.status"),
    startDate: requiredString(record, "milestone.startDate"),
    endDate: optionalString(record, "milestone.endDate"),
    overdue: requiredBoolean(record, "milestone.overdue"),
    dependencyConflict: requiredBoolean(record, "milestone.dependencyConflict"),
    version: requiredNumber(record, "milestone.version"),
  };
};

const decodeDeliverable = (value: unknown): Deliverable => {
  const record = requiredRecord(value, "deliverable");
  const state = requiredString(record, "deliverable.state");
  if (state !== "Open" && state !== "Complete")
    throw new Error(
      "API response field deliverable.state must be Open or Complete.",
    );
  return {
    id: requiredString(record, "deliverable.id"),
    title: requiredString(record, "deliverable.title"),
    owner: decodePerson(record.owner, "deliverable.owner"),
    dueDate: optionalString(record, "deliverable.dueDate"),
    state,
    overdue: requiredBoolean(record, "deliverable.overdue"),
    version: requiredNumber(record, "deliverable.version"),
  };
};

const decodeRisk = (value: unknown): RiskSummary => {
  const record = requiredRecord(value, "risk");
  return {
    id: requiredString(record, "risk.id"),
    title: requiredString(record, "risk.title"),
    severity: requiredString(record, "risk.severity"),
    state: requiredString(record, "risk.state"),
    owner: decodePerson(record.owner, "risk.owner"),
    dueDate: optionalString(record, "risk.dueDate"),
    signal: requiredText(record, "risk.signal"),
    mitigation: requiredText(record, "risk.mitigation"),
    version: requiredNumber(record, "risk.version"),
  };
};

const decodeDecision = (value: unknown): DecisionSummary => {
  const record = requiredRecord(value, "decision");
  return {
    id: requiredString(record, "decision.id"),
    title: requiredString(record, "decision.title"),
    priority: requiredString(record, "decision.priority"),
    state: requiredString(record, "decision.state"),
    dueAt: requiredString(record, "decision.dueAt"),
    requester: decodePerson(record.requester, "decision.requester"),
    assignee: optionalRecord(record, "decision.assignee")
      ? decodePerson(record.assignee, "decision.assignee")
      : null,
    version: requiredNumber(record, "decision.version"),
  };
};

export const decodeSession: Decoder<OperatorSession> = (value) => {
  const record = requiredRecord(value, "session");
  const operatorRecord = requiredRecord(record.operator, "operator");
  const workspace = requiredRecord(record.workspace, "workspace");
  return {
    operator: {
      ...decodePerson(operatorRecord, "operator"),
      email: requiredString(operatorRecord, "operator.email"),
    },
    workspace: {
      id: requiredString(workspace, "workspace.id"),
      name: requiredString(workspace, "workspace.name"),
      timezone: requiredString(workspace, "workspace.timezone"),
      currency: requiredString(workspace, "workspace.currency"),
    },
    unreadNotifications: requiredNumber(record, "unreadNotifications"),
  };
};

export const decodePortfolio: Decoder<PortfolioResponse> = (value) => {
  const record = requiredRecord(value, "portfolio");
  const metrics = requiredRecord(record.metrics, "portfolio.metrics");
  const portfolioHealth = requiredNullableNumber(
    metrics,
    "portfolio.metrics.portfolioHealth",
  );
  const decodedMetrics: PortfolioMetrics = {
    liveCampaigns: requiredNumber(metrics, "portfolio.metrics.liveCampaigns"),
    needsAttention: requiredNumber(metrics, "portfolio.metrics.needsAttention"),
    openDecisions: requiredNumber(metrics, "portfolio.metrics.openDecisions"),
    portfolioHealth,
    staleHealthCount: requiredNumber(
      metrics,
      "portfolio.metrics.staleHealthCount",
    ),
  };
  return {
    metrics: decodedMetrics,
    attention: requiredArray(record, "portfolio.attention").map(
      decodeCampaignSummary,
    ),
    upcomingMilestones: requiredArray(
      record,
      "portfolio.upcomingMilestones",
    ).map(decodeMilestone),
    recentActivity: requiredArray(record, "portfolio.recentActivity").map(
      decodeActivity,
    ),
  };
};

export const decodeCampaignList: Decoder<CampaignListResponse> = (value) => {
  const record = requiredRecord(value, "campaigns");
  const cursor = requiredNullableString(record, "campaigns.cursor");
  return {
    items: requiredArray(record, "campaigns.items").map(decodeCampaignSummary),
    total: requiredNumber(record, "campaigns.total"),
    totalLabel: requiredString(record, "campaigns.totalLabel"),
    cursor,
  };
};

export const decodeCampaignDetail: Decoder<CampaignDetailResponse> = (
  value,
) => {
  const record = requiredRecord(value, "campaign detail");
  const campaignRecord = requiredRecord(
    record.campaign,
    "campaign detail.campaign",
  );
  const campaign: CampaignDetail = {
    ...decodeCampaignSummary(campaignRecord),
    objective: requiredText(campaignRecord, "campaign.objective"),
    summary: requiredText(campaignRecord, "campaign.summary"),
    healthSetBy: optionalRecord(campaignRecord, "campaign.healthSetBy")
      ? decodePerson(campaignRecord.healthSetBy, "campaign.healthSetBy")
      : null,
    healthSetAt: optionalString(campaignRecord, "campaign.healthSetAt"),
  };
  return {
    campaign,
    deliverables: requiredArray(record, "campaign detail.deliverables").map(
      decodeDeliverable,
    ),
    milestones: requiredArray(record, "campaign detail.milestones").map(
      decodeMilestone,
    ),
    risks: requiredArray(record, "campaign detail.risks").map(decodeRisk),
    decisions: requiredArray(record, "campaign detail.decisions").map(
      decodeDecision,
    ),

    activity: requiredArray(record, "campaign detail.activity").map(
      decodeActivity,
    ),
    customFields: requiredArray(record, "campaign detail.customFields") as CampaignDetailResponse["customFields"],
  };
};

export const decodeCampaignMutation: Decoder<CampaignSummary> = (value) =>
  decodeCampaignSummary(requiredRecord(value, "campaign mutation").campaign);

export const decodeDeliverableMutation: Decoder<Deliverable> = (value) =>
  decodeDeliverable(requiredRecord(value, "deliverable mutation").deliverable);

const decodeError = async (response: Response) => {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* response status and text remain useful */
  }
  const envelope = isRecord(body) && isRecord(body.error) ? body.error : null;
  const message =
    envelope && typeof envelope.message === "string"
      ? envelope.message
      : `Request failed with status ${response.status}.`;
  const code =
    envelope && typeof envelope.code === "string"
      ? envelope.code
      : `http_${response.status}`;
  const currentVersion =
    envelope && typeof envelope.currentVersion === "number"
      ? envelope.currentVersion
      : null;
  const kind: ApiErrorKind =
    response.status === 401
      ? "signed-out"
      : response.status === 403
        ? "forbidden"
      : response.status === 404
        ? "not-found"
        : "failed";
  return new ApiError({
    kind,
    status: response.status,
    code,
    message,
    currentVersion,
  });
};

export async function requestJson<T>(
  url: string,
  decoder: Decoder<T>,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    const { headers, ...requestInit } = init ?? {};
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Accept", "application/json");
    if (init?.body) requestHeaders.set("Content-Type", "application/json");
    response = await sessionFetch(url, { ...requestInit, headers: requestHeaders });
  } catch (cause) {
    throw new ApiError({
      kind: "failed",
      status: 0,
      code: "network_error",
      message:
        cause instanceof Error
          ? cause.message
          : "The request could not reach the workspace.",
    });
  }
  if (!response.ok) throw await decodeError(response);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError({
      kind: "failed",
      status: response.status,
      code: "invalid_json",
      message: "The server returned an invalid JSON response.",
    });
  }
  try {
    return decoder(body);
  } catch (cause) {
    throw new ApiError({
      kind: "failed",
      status: response.status,
      code: "invalid_response",
      message:
        cause instanceof Error
          ? cause.message
          : "The server returned an invalid response.",
    });
  }
}

export function useApiResource<T>(url: string, decoder: Decoder<T>, options: { keepPreviousData?: boolean } = {}) {
  const session = useDocumentSession();
  const initial = useDocumentData();
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<ApiResource<T>>(() => {
    const seed = initial[url]
    if (isRecord(seed) && isRecord(seed.error) && seed.error.code === 'forbidden') return { state: 'forbidden', data: null, error: new ApiError({ kind: 'forbidden', status: 403, code: 'forbidden', message: String(seed.error.message) }) }
    return url === "/api/session" && session ? { state: "ready", data: decoder(session), error: null } : url in initial ? { state: "ready", data: decoder(seed), error: null } : { state: "loading", data: null, error: null }
  });
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  const mounted = useRef(false);
  const loadedUrl = useRef(url);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; if ((url === "/api/session" && session) || url in initial) return; }
    let active = true;
    if (!options.keepPreviousData || loadedUrl.current !== url) setResource({ state: "loading", data: null, error: null });
    loadedUrl.current = url;
    requestJson(url, decoder).then(
      (data) => {
        if (active) setResource({ state: "ready", data, error: null });
      },
      (error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof ApiError
            ? error
            : new ApiError({
                kind: "failed",
                status: 0,
                code: "unknown_error",
                message: "The request failed unexpectedly.",
              });
        setResource({ state: apiError.kind, data: null, error: apiError });
      },
    );
    return () => {
      active = false;
    };
  }, [url, decoder, revision, options.keepPreviousData]);

  return { resource, retry };
}

export const campaignQueryUrl = (query: CampaignQuery) => {
  const search = new URLSearchParams({
    view: query.view,
    sort: query.sort,
    direction: query.direction,
  });
  if (query.phase) search.set("phase", query.phase);
  if (query.status) search.set("status", query.status);
  if (query.group !== "none") search.set("group", query.group);
  return `/api/campaigns?${search.toString()}`;
};
