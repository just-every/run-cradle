import { Changes } from './Changes'
import { Closing } from './Closing'
import { Hero } from './Hero'
import { Ownership } from './Ownership'
import { Practical } from './Practical'
import { Tables } from './Tables'
import { Views } from './Views'
import { Defs } from './parts/Defs'
import { SiteFooter } from '../../site/SiteFooter'
import { SiteHeader } from '../../site/SiteHeader'
import './css/base.css'
import './css/hero.css'
import './css/hero-art.css'
import './css/hero-live.css'
import './css/screen.css'
import './css/sections.css'
import './css/practical.css'
import './css/ownership.css'
import './css/closing.css'
import './css/docs-links.css'
import './css/motion.css'

export type LandingProps = {
  productName: string
  landingMessage: string
  showCredit: boolean
}

/** The approved product page, served at `/` of the run site (run-cradle.com; src/site/pages.tsx). Static copy and illustrations plus the values the owner configures. */
export function Landing({ productName, landingMessage, showCredit }: LandingProps) {
  return <div className="lp">
    <Defs />
    <SiteHeader productName={productName} page="home" />
    <main>
      <Hero landingMessage={landingMessage} />
      <div className="lp-carry" aria-hidden="true">
        <svg viewBox="0 0 1440 170" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="lp-cg1" x1="0" x2="1"><stop offset="0" stopColor="#12372e" stopOpacity="0" /><stop offset=".3" stopColor="#12372e" stopOpacity=".9" /><stop offset=".7" stopColor="#12372e" stopOpacity=".9" /><stop offset="1" stopColor="#12372e" stopOpacity="0" /></linearGradient>
            <linearGradient id="lp-cg2" x1="0" x2="1"><stop offset="0" stopColor="#d7f25b" stopOpacity="0" /><stop offset=".25" stopColor="#d7f25b" /><stop offset=".8" stopColor="#d7f25b" /><stop offset="1" stopColor="#d7f25b" stopOpacity="0" /></linearGradient>
          </defs>
          <path d="M0 40 C300 10 520 130 760 90 S1200 30 1440 100" stroke="url(#lp-cg2)" strokeWidth="14" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d="M0 70 C300 60 520 140 760 100 S1200 60 1440 120" stroke="url(#lp-cg1)" strokeWidth="4" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <Tables />
      <Views />
      <Changes />
      <Practical />
      <Ownership />
      <Closing />
    </main>
    <SiteFooter productName={productName} showCredit={showCredit} page="home" />
  </div>
}
