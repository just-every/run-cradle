import { BrandLockup } from '../../ui/brand-lockup'
import { BrandMark } from '../../ui/brand-mark'
import { FooterCredit } from '../../ui/footer-credit'

const anchors = [['Tables', '#tables'], ['Views', '#views'], ['Changes', '#changes'], ['Ownership', '#ownership']] as const

/** Brand, in-page anchors (a plain list, not a navigation landmark: `/` has no operator navigation) and the configurable credit. */
export function SiteFooter({ productName, showCredit }: { productName: string; showCredit: boolean }) {
  return <footer className="lp-footer">
    <div className="lp-wrap lp-footer-row">
      <div className="lp-brand lp-brand--small"><BrandLockup name={productName} variant="paper" /></div>
      <ul className="lp-links">{anchors.map(([label, href]) => <li key={href}><a href={href}>{label}</a></li>)}</ul>
      <div className="lp-credit"><FooterCredit mark={<BrandMark className="lp-credit-mark" variant="paper" />} productName={productName} visible={showCredit} /></div>
    </div>
  </footer>
}
