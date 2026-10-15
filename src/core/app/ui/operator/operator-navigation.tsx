import { Link } from '@tanstack/react-router'
import { seedConfig } from '../../../../ext/config'
import { OperatorIcon } from './operator-icon'

export type Item = { label: string; href: string; icon: string }
type NavigationProps = { currentPath: string; onNavigate?: () => void }
function NavigationLink({ item, currentPath, onNavigate }: NavigationProps & { item: Item }) {
  const active = currentPath === item.href || (item.href !== '/app' && currentPath.startsWith(`${item.href}/`))
  return <Link className="operator-nav-link" to={item.href} activeOptions={{ exact: true }} aria-current={active ? 'page' : undefined} onClick={onNavigate}><OperatorIcon name={item.icon} /><span className="operator-nav-label">{item.label}</span></Link>
}
export function OperatorNavigation(props: NavigationProps & { unreadNotifications: number; items: Item[] }) {
  const config = seedConfig
  return <nav className="operator-nav" aria-label="Operator navigation"><p className="operator-nav-heading">Workspace</p>{props.items.map(item => <NavigationLink key={item.href} item={item} {...props} />)}{config.enableRepairs && <><p className="operator-nav-heading">Operations</p><NavigationLink item={{ label: 'Operations', href: '/app/operations', icon: 'automation' }} {...props} /><NavigationLink item={{ label: 'Repairs', href: '/app/repairs', icon: 'repair' }} {...props} /></>}</nav>
}
export function LaunchNavigation(props: NavigationProps & { items: Item[] }) {
  return <details className="operator-work-views" open={/^\/app\/(campaigns|launch|overview|milestones|risks|decisions|lenses)/.test(props.currentPath)}><summary>Launch views</summary><p className="operator-nav-heading">Included template</p><nav aria-label="Launch readiness">{props.items.map(item => <NavigationLink key={item.href} item={item} {...props} />)}</nav></details>
}
export function UtilityNavigation({ unreadNotifications, onNavigate, items, currentPath }: { unreadNotifications: number; onNavigate?: () => void; items: Item[]; currentPath: string }) {
  return <nav className="operator-utilities" aria-label="Workspace utilities">{items.map(item => <Link key={item.href} to={item.href} onClick={onNavigate} aria-current={currentPath === item.href || currentPath.startsWith(`${item.href}/`) ? 'page' : undefined}><OperatorIcon name={item.icon} /><span>{item.label}</span>{item.icon === 'bell' && unreadNotifications > 0 && <span aria-label={`${unreadNotifications} unread`}>{unreadNotifications}</span>}</Link>)}</nav>
}
