import { useSeedConfig } from '../../app/router'
import type { SeedConfig } from '../../shared/config'
import { SiteFooter } from '../../app/site/SiteFooter'
import { SiteHeader } from '../../app/site/SiteHeader'
import { DocsArticle } from './DocsArticle'
import { DocsMenu } from './DocsMenu'
import { DocsPager } from './DocsPager'
import { DocsSidebar } from './DocsSidebar'
import { DocsToc } from './DocsToc'
import type { DocsView } from './types'
import { useCurrentDocs } from './useCurrentDocs'
import './docs.css'

/** A documentation page in the installed app, with the deployment's configuration. */
export function DocsPage(view: DocsView) {
  return <DocsLayout config={useSeedConfig()} {...view} />
}

/** A documentation page between the site's own header and footer: sidebar | page | contents. The page title is the document's one h1. The run site renders it without a router. */
export function DocsLayout({ config, page, sections, repository, version }: DocsView & { config: SeedConfig }) {
  useCurrentDocs(version)
  const order = sections.flatMap(section => section.pages.map(entry => ({ ...entry, section: section.title })))
  const index = order.findIndex(entry => entry.slug === page.slug)
  const current = order[index]!
  return <div className="docs-site">
    <a className="docs-skip" href="#docs-content">Skip to documentation</a>
    <SiteHeader productName={config.productName} page="docs" />
    <div className="docs-shell">
      <DocsSidebar sections={sections} current={page.slug} />
      <main id="docs-content" tabIndex={-1} className="docs-main">
        <DocsMenu sections={sections} current={page.slug} label={current.label} />
        <DocsArticle page={page} section={current.section} />
        <DocsPager previous={order[index - 1]} next={order[index + 1]} editUrl={repository ? `${repository.url}/edit/${repository.branch}/${page.source}` : null} />
      </main>
      <DocsToc toc={page.toc} />
    </div>
    <SiteFooter productName={config.productName} showCredit={config.showPoweredByCredit} page="docs" />
  </div>
}
