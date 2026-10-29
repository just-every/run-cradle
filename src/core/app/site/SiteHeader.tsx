import { Link } from '@tanstack/react-router'
import { BrandLockup } from '../ui/brand-lockup'
import { sourceUrl } from './source'
import { useSiteVariant } from './variant'
import { HydrationUnit } from '../../../base/hydration/unit'
import './site.css'

export type SitePage = 'home' | 'docs'

/** The header of every public page, `/` and `/docs` alike: the lockup (a link home everywhere but home), Docs, Contract (the run site only; an installation does not serve it), Source and, on an installed instance, the Sign in pill, or Open workspace for a visitor with an open session. */
export function SiteHeader({ productName, page, signedIn = false }: { productName: string; page: SitePage; signedIn?: boolean }) {
  const site = useSiteVariant() === 'site'
  const lockup = <BrandLockup name={productName} variant="paper" />
  return <HydrationUnit><header className="site-header">
    <div className="site-header-row">
      {page === 'home'
        ? <div className="site-brand">{lockup}</div>
        : <a className="site-brand" href="/" aria-label={`${productName} home`}>{lockup}</a>}
      <nav className="site-nav" aria-label="Site">
        {site
          ? <a href="/docs" aria-current={page === 'docs' ? 'page' : undefined}>Docs</a>
          : <Link to="/docs" aria-current={page === 'docs' ? 'page' : undefined}>Docs</Link>}
        {site && <a href="/contract">Contract</a>}
        <a href={sourceUrl}>Source</a>
        {!site && (signedIn ? <Link className="site-signin" to="/app">Open workspace</Link> : <Link className="site-signin" to="/signin">Sign in</Link>)}
      </nav>
    </div>
  </header></HydrationUnit>
}
