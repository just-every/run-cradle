import type { ReactNode } from 'react'
import { DocsLink } from '../../../../features/docs/DocsLink'

/** A quiet text link into the published guide. `slug` is a page of docs/site.json ("" is the docs home); `lead` is the larger form beside a button. */
export function DocsMore({ slug, size, children }: { slug: string; size?: 'lead'; children: ReactNode }) {
  return <DocsLink slug={slug} className={size ? `lp-more lp-more--${size}` : 'lp-more'}>{children}</DocsLink>
}
