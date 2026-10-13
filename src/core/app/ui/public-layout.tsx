import type { PropsWithChildren } from 'react'

import type { SeedConfig } from '../../shared/config'
import { RibbonValley } from '../../../ui/shared/ribbon-valley'
import { BrandLockup } from './brand-lockup'
import { BrandMark } from './brand-mark'
import { FooterCredit } from './footer-credit'
import { HydrationUnit } from '../../../base/hydration/unit'

type PublicLayoutProps = PropsWithChildren<{
  config: SeedConfig
  /** `short`: the lime band stops before the ribbons meet (not found). */
  ribbon?: 'whole' | 'short'
}>

export const PublicLayout = ({ children, config, ribbon = 'whole' }: PublicLayoutProps) => (
  <main className="cr-public">
    <HydrationUnit><p className="cr-public-brand"><BrandLockup name={config.productName} variant="paper" /></p></HydrationUnit>
    <div className="cr-public-body"><HydrationUnit>{children}</HydrationUnit></div>
    <RibbonValley id="cr-valley" className="cr-public-ribbons" short={ribbon === 'short'} />
    <HydrationUnit><footer className="cr-public-footer">
      <FooterCredit mark={<BrandMark className="size-5 shrink-0" variant="paper" />} productName={config.productName} visible={config.showPoweredByCredit} />
    </footer></HydrationUnit>
  </main>
)
