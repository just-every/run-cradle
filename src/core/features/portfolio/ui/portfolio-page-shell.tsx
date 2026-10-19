import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";

import {
  OperatorShell,
  ResourceBoundary,
  type ResourceBoundaryState,
} from "../../../app/ui/operator";

import {
  decodeSession,
  useApiResource,
  type ApiResource,
} from "./portfolio-api";
import type { OperatorSession } from "./portfolio-types";

import "./portfolio-ui.css";

type PortfolioPageShellProps = PropsWithChildren<{
  currentPath: string;
  title: string;
  session: OperatorSession;
  actions?: ReactNode;
}>;

export const useOperatorSession = () => {
  const session = useApiResource("/api/session", decodeSession);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  useEffect(() => setUnreadCount(null), [session.resource]);
  useEffect(() => {
    const changed = (event: Event) => {
      const value: unknown = (event as CustomEvent<{ unreadCount?: unknown }>).detail?.unreadCount;
      if (typeof value === "number" && Number.isInteger(value) && value >= 0) setUnreadCount(value);
    };
    window.addEventListener("notification-inbox-changed", changed);
    return () => window.removeEventListener("notification-inbox-changed", changed);
  }, []);

  useEffect(() => {
    const refresh = () => session.retry();
    window.addEventListener("operator-session-changed", refresh);
    return () => window.removeEventListener("operator-session-changed", refresh);
  }, [session.retry]);

  return { ...session, resource: session.resource.state === "ready" && unreadCount !== null
    ? { ...session.resource, data: { ...session.resource.data, unreadNotifications: unreadCount } }
    : session.resource };
};

export const OperatorSessionBoundary = ({
  resource,
  onRetry,
  children,
}: PropsWithChildren<{
  resource: ApiResource<OperatorSession>;
  onRetry: () => void;
}>) => {
  const state: ResourceBoundaryState | undefined =
    resource.state === "ready" ? undefined : resource.state;

  if (state)
    return (
      <ResourceBoundary
        state={state}
        operation="operator session"
        error={resource.error?.message}
        onRetry={onRetry}
      />
    );

  return <>{children}</>;
};

export const PortfolioPageShell = ({
  currentPath,
  title,
  session,
  actions,
  children,
}: PortfolioPageShellProps) => (
  <OperatorShell
    currentPath={currentPath}
    title={title}
    actions={actions}
    identity={{
      name: session.operator.name,
      initials: session.operator.initials,
      unreadNotifications: session.unreadNotifications,
      workspaceName: session.workspace.name,
    }}
  >
    {children}
  </OperatorShell>
);
