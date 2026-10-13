import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useSiteVariant } from '../../app/site/variant'

type DocsLinkProps = {
  /** The page's slug from docs/site.json ("" is the docs home). */
  slug: string
  className?: string
  rel?: string
  'aria-current'?: 'page'
  children: ReactNode
}

/** A client-side link to a published docs page (a plain anchor on the run site). Only the page itself counts as active, so `/docs` is not marked on every page. */
export function DocsLink({ slug, children, ...props }: DocsLinkProps) {
  if (useSiteVariant() === 'site') return <a href={slug ? `/docs/${slug}` : '/docs'} {...props}>{children}</a>
  return slug
    ? <Link to="/docs/$slug" params={{ slug }} activeOptions={{ exact: true }} {...props}>{children}</Link>
    : <Link to="/docs" activeOptions={{ exact: true }} {...props}>{children}</Link>
}
