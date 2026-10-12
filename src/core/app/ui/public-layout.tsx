import type { PropsWithChildren } from 'react'

import type { SeedConfig } from '../../shared/config'
import { BrandMark } from './brand-mark'
import { FooterCredit } from './footer-credit'

type PublicLayoutProps = PropsWithChildren<{
  config: SeedConfig
}>

export const PublicLayout = ({ children, config }: PublicLayoutProps) => (
  <main className="cr-public relative min-h-dvh overflow-hidden bg-background px-5 py-7 text-foreground sm:px-9 sm:py-9">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(215,242,91,0.10),transparent_28rem)]" />
    <div className="relative mx-auto flex min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4.5rem)] max-w-6xl flex-col">
      <div className="flex flex-1 items-center justify-center py-14 sm:py-20">{children}</div>
      <footer className="border-t border-border pt-6 sm:pt-8">
        <FooterCredit mark={<BrandMark className="size-5 shrink-0" variant="paper" />} productName={config.productName} visible={config.showPoweredByCredit} />
      </footer>
    </div>
  </main>
)
