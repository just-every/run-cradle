import { Link } from '@tanstack/react-router'
import { BrandLockup } from '../ui/brand-lockup'
import { BrandMark } from '../ui/brand-mark'
import { FooterCredit } from '../ui/footer-credit'
import type { SitePage } from './SiteHeader'
import { licenceUrl, sourceUrl } from './source'
import { useSiteVariant } from './variant'
import { HydrationUnit } from '../../../base/hydration/unit'
import './site.css'

const sections = [['Tables', 'tables'], ['Views', 'views'], ['Changes', 'changes'], ['Ownership', 'ownership']] as const

/** The footer of every public page: the lockup, the landing's section anchors (`/#…` from the docs, so they still land), Docs, Source, Sign in on an installed instance, the licence and the configurable credit. A plain list, not a landmark: `/` has no operator navigation. */
export function SiteFooter({ productName, showCredit, page }: { productName: string; showCredit: boolean; page: SitePage }) {
  const site = useSiteVariant() === 'site'
  const lockup = <BrandLockup name={productName} variant="paper" />
  return <HydrationUnit><footer className="site-footer">
    <div className="site-footer-row">
      {page === 'home'
        ? <div className="site-brand site-brand--small">{lockup}</div>
        : <a className="site-brand site-brand--small" href="/" aria-label={`${productName} home`}>{lockup}</a>}
      <ul className="site-links">
        {sections.map(([label, id]) => <li key={id}><a href={`${page === 'home' ? '' : '/'}#${id}`}>{label}</a></li>)}
        <li>{site ? <a href="/docs">Docs</a> : <Link to="/docs">Docs</Link>}</li>
        <li><a href={sourceUrl}>Source</a></li>
        {!site && <li><Link to="/signin">Sign in</Link></li>}
        <li><a href={licenceUrl}>MIT licence</a></li>
      </ul>
      <div className="site-credit"><FooterCredit mark={<BrandMark className="site-credit-mark" variant="paper" />} productName={productName} visible={showCredit} /></div>
    </div>
  </footer></HydrationUnit>
}
