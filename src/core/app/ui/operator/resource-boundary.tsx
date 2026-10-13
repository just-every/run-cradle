import type { PropsWithChildren, ReactNode } from "react";

export type ResourceBoundaryState =
  | "loading"
  | "empty"
  | "not-found"
  | "signed-out"
  | "failed"
  | "forbidden";

type ResourceBoundaryProps = PropsWithChildren<{
  state?: ResourceBoundaryState;
  operation: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  error?: string;
  actions?: ReactNode;
}>;

const tones: Record<ResourceBoundaryState, string> = {
  loading: "",
  empty: "",
  "not-found": "cr-tag--warn",
  "signed-out": "cr-tag--access",
  forbidden: "cr-tag--access",
  failed: "cr-tag--error",
};

const copyFor = (
  state: ResourceBoundaryState,
  operation: string,
  emptyTitle?: string,
  emptyDescription?: string,
  error?: string,
) => {
  switch (state) {
    case "loading":
      return {
        eyebrow: "Loading",
        title: `Loading ${operation}`,
        description: "Waiting for the current workspace data.",
      };
    case "empty":
      return {
        eyebrow: "No records",
        title: emptyTitle ?? `No ${operation} yet`,
        description: emptyDescription ?? "There is nothing to show right now.",
      };
    case "not-found":
      return {
        eyebrow: "Not found",
        title: `${operation} is unavailable`,
        description:
          "It may have been deleted, archived, or the link may be incomplete.",
      };
    case "signed-out":
      return {
        eyebrow: "Signed out",
        title: "Your operator session is required",
        description: "Sign in to open this workspace and its current records.",
      };
    case "forbidden":
      return { eyebrow: "Access", title: "This work is outside your access", description: error ?? "Your current access does not permit this action." };
    case "failed":
      return {
        eyebrow: "Could not load",
        title: `Unable to load ${operation}`,
        description:
          error ??
          "The latest request failed before any records could be shown.",
      };
  }
};

export const ResourceBoundary = ({
  children,
  state,
  operation,
  onRetry,
  emptyTitle,
  emptyDescription,
  error,
  actions,
}: ResourceBoundaryProps) => {
  if (!state) return <>{children}</>;
  const copy = copyFor(state, operation, emptyTitle, emptyDescription, error);

  return (
    <section
      className="cr-state cr-state--boundary"
      aria-live={state === "loading" ? "polite" : "assertive"}
    >
      <span className={`cr-tag ${tones[state]}`}>{copy.eyebrow}</span>
      <h2>{copy.title}</h2>
      <p>{copy.description}</p>
      <div className="cr-actions">
        {state === "signed-out" ? (
          <a className="cr-button" href="/signin">
            Sign in
          </a>
        ) : null}
        {state === "failed" && onRetry ? (
          <button className="cr-button" type="button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        {actions}
      </div>
    </section>
  );
};
