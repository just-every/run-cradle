import { useDocumentSession } from '../../document-context'
import { OperatorNavigation, LaunchNavigation, UtilityNavigation } from './operator-navigation'
import type { Item } from './operator-navigation'
import { OperatorIcon } from './operator-icon'
import { OwnerMenu } from './owner-menu'
import { cycleModalFocus } from '../../../../ui/modal-focus'
import { Tooltip } from '../../../../ui/shared/tooltip'
import { BrandLockup } from '../brand-lockup'
import { Link } from '@tanstack/react-router';
import {
  useEffect,
  useState,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from "react";

import "./operator-shell.css";

export type OperatorShellIdentity = {
  name: string;
  initials: string;
  unreadNotifications: number;
  workspaceName: string;
};

type OperatorShellProps = PropsWithChildren<{
  currentPath: string;
  identity: OperatorShellIdentity;
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
}>;

const records: Item[] = [
  { label: 'Home', href: '/app', icon: 'home' },
  { label: 'Records', href: '/app/records', icon: 'grid' },
  { label: 'App studio', href: '/app/operations/studio', icon: 'studio' },
  { label: 'Automations', href: '/app/automations', icon: 'automation' },
]
const launch: Item[] = [
  { label: 'Overview', href: '/app/overview', icon: 'overview' },
  { label: 'Campaigns', href: '/app/campaigns', icon: 'grid' },
  { label: 'Risks', href: '/app/lenses/risks', icon: 'risk' },
  { label: 'Timeline', href: '/app/lenses/timeline', icon: 'timeline' },
  { label: 'New lens', href: '/app/lenses/new', icon: 'lens' },
  { label: 'Decisions', href: '/app/decisions', icon: 'decision' },
]
const utilities: Item[] = [
  { label: 'Search', href: '/app/search', icon: 'lens' },
  { label: 'Notifications', href: '/app/notifications', icon: 'bell' },
  { label: 'Settings', href: '/app/settings', icon: 'settings' },
]

const OperatorRail = ({
  currentPath,
  identity,
  onNavigate,
}: {
  currentPath: string;
  identity: OperatorShellIdentity;
  onNavigate?: () => void;
}) => {
 const session = useDocumentSession() as (ReturnType<typeof useDocumentSession> & { launchInUse?: boolean })
 const showLaunch = /^\/app\/(campaigns|launch|overview|milestones|risks|decisions|lenses)/.test(currentPath) || session?.launchInUse === true
 return (
  <div className="operator-rail-content">
    <Link
      className="operator-brand"
      to="/app"
      onClick={onNavigate}
      aria-label={`${identity.workspaceName} home`}
    >
      <BrandLockup runtimeLabel className="operator-brand-lockup" name="Cradle" variant="dark" />
    </Link>
    <OperatorNavigation items={records}
      currentPath={currentPath}
      unreadNotifications={identity.unreadNotifications}
      onNavigate={onNavigate}
    />
    {showLaunch && <LaunchNavigation items={launch} currentPath={currentPath} onNavigate={onNavigate} />}
    <UtilityNavigation items={utilities} currentPath={currentPath} unreadNotifications={identity.unreadNotifications} onNavigate={onNavigate} />
    <OwnerMenu owner={identity} />
  </div>
);
}

export const OperatorShell = ({
  children,
  currentPath,
  identity,
  title,
  description,
  actions,
}: OperatorShellProps) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (drawerOpen) drawer.current?.showModal(); else if (drawer.current?.open) { drawer.current.close(); menuButton.current?.focus(); } }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      cycleModalFocus(event, drawer.current);
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="operator-shell">
      <nav aria-label="Skip links">
        <a className="operator-skip" href="#main-content">Skip to content</a>
      </nav>
      <aside className="operator-rail">
        <OperatorRail currentPath={currentPath} identity={identity} />
      </aside>
      <header className="operator-mobile-header">
        <Tooltip label="Open navigation"><button
          ref={menuButton}
          className="operator-menu-button"
          type="button"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <span />
          <span />
          <span />
        </button></Tooltip>
        <Link className="operator-mobile-brand" to="/app">
          <BrandLockup runtimeLabel className="operator-brand-lockup" name="Cradle" variant="dark" />
        </Link>
        <Tooltip label={identity.unreadNotifications ? `${identity.unreadNotifications} unread notifications` : "No unread notifications"}><Link
          className="operator-mobile-bell"
          to="/app/notifications"
        >
          <OperatorIcon name="bell" />
          {identity.unreadNotifications ? (
            <b>
              {identity.unreadNotifications > 99
                ? "99+"
                : identity.unreadNotifications}
            </b>
          ) : null}
        </Link></Tooltip>
      </header>
      <main id="main-content" tabIndex={-1} className="operator-main">
        {title || actions ? (
          <header className="operator-page-header">
            <div>
              <p className="operator-page-kicker">{identity.workspaceName}</p>
              {title ? <h1>{title}</h1> : null}
              {description ? <p className="operator-page-description">{description}</p> : null}
            </div>
            {actions ? (
              <div className="operator-page-actions">{actions}</div>
            ) : null}
          </header>
        ) : null}
        <div className="operator-content">{children}</div>
      </main>
      <dialog ref={drawer} className="operator-drawer" aria-label="Navigation" onCancel={() => setDrawerOpen(false)} onClose={() => setDrawerOpen(false)}>
        <div className="operator-drawer-header">
          <span>Navigation</span>
          <Tooltip label="Close navigation"><button
            type="button"
            onClick={() => setDrawerOpen(false)}
          >
            ×
          </button></Tooltip>
        </div>
        <OperatorRail
          currentPath={currentPath}
          identity={identity}
          onNavigate={() => setDrawerOpen(false)}
        />
      </dialog>
    </div>
  );
};
