import { useDocumentSession } from '../../document-context'
import { readApi } from '../../../../ui/shared/api'
import type { ConstructionReadiness } from '../../../../domains/construction/contracts'
import { OperatorNavigation, UtilityNavigation } from './operator-navigation'
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
  { label: 'Automations', href: '/app/automations', icon: 'automation' },
]
const studio: Item = { label: 'App studio', href: '/app/operations/studio', icon: 'studio' }
const utilities: Item[] = [
  { label: 'Search', href: '/app/search', icon: 'lens' },
  { label: 'Notifications', href: '/app/notifications', icon: 'bell' },
  { label: 'Settings', href: '/app/settings', icon: 'settings' },
]

// Keep one readiness read per signed-in document, shared by Home and both rails.
// Nothing is offered during the read or after a failed answer; server rendering
// never shares a person's readiness with another document.
const studioReads = new WeakMap<Document, Map<string, Promise<boolean>>>()
export function useAppStudioReady() {
  const session = useDocumentSession()
  const principal = session?.operator.id ?? ''
  const guest = Boolean(session?.guest)
  const [answer, setAnswer] = useState<{ principal: string; ready: boolean } | null>(null)
  useEffect(() => {
    if(guest)return
    let active = true
    let reads = studioReads.get(document)
    if (!reads) studioReads.set(document, reads = new Map())
    let pending = reads.get(principal)
    if (!pending) {
      pending = readApi<ConstructionReadiness>('/api/v1/construction/readiness')
        .then(({ data }) => data?.ready === true).catch(() => false)
      reads.set(principal, pending)
    }
    pending.then(ready => { if (active) setAnswer({ principal, ready }) })
    return () => { active = false }
  }, [principal,guest])
  return !guest && answer?.principal === principal && answer.ready
}

const OperatorRail = ({
  currentPath,
  identity,
  onNavigate,
  appStudioReady,
}: {
  currentPath: string;
  identity: OperatorShellIdentity;
  onNavigate?: () => void;
  appStudioReady: boolean;
}) => {
 const guest=useDocumentSession()?.guest
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
    <OperatorNavigation items={guest ? records.filter(item=>item.label==='Records') : appStudioReady ? [...records, studio] : records}
      currentPath={currentPath}
      unreadNotifications={identity.unreadNotifications}
      onNavigate={onNavigate}
    />
    <UtilityNavigation items={guest ? utilities.filter(item=>item.label==='Search') : utilities} currentPath={currentPath} unreadNotifications={identity.unreadNotifications} onNavigate={onNavigate} />
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
  const appStudioReady = useAppStudioReady();
  const guest=useDocumentSession()?.guest;
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
        <OperatorRail currentPath={currentPath} identity={identity} appStudioReady={appStudioReady} />
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
        {!guest && <Tooltip label={identity.unreadNotifications ? `${identity.unreadNotifications} unread notifications` : "No unread notifications"}><Link
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
        </Link></Tooltip>}
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
          appStudioReady={appStudioReady}
          onNavigate={() => setDrawerOpen(false)}
        />
      </dialog>
    </div>
  );
};
