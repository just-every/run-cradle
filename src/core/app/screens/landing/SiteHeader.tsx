import { Link } from '@tanstack/react-router'
import { BrandLockup } from '../../ui/brand-lockup'

/** The brand and the one Sign in link. It sits above the hero art, on the hero's own paper. */
export function SiteHeader({ productName }: { productName: string }) {
  return <header className="lp-header">
    <div className="lp-header-row">
      <div className="lp-brand"><BrandLockup name={productName} variant="paper" /></div>
      <Link className="lp-signin" to="/signin">Sign in</Link>
    </div>
  </header>
}
