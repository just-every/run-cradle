import type { ReactNode } from 'react'

type FooterCreditProps = {
  productName: string
  visible: boolean
  /** The brand mark shown before the credit. Passed in so this file stays free of local imports. */
  mark?: ReactNode
}

export const FooterCredit = ({ productName, visible, mark }: FooterCreditProps) => {
  if (!visible) return null

  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      {mark}
      <span>Powered by {productName}</span>
      <span aria-hidden="true">·</span>
      <a className="inline-flex min-h-6 items-center underline decoration-border underline-offset-4 hover:text-foreground" href="https://runeditrun.com">
        runeditrun.com
      </a>
    </p>
  )
}
