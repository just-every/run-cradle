import { createFileRoute } from '@tanstack/react-router'
import { editorLeaf } from '../core/features/editor/leaf'
import { DocsPage } from '../core/features/docs/DocsPage'
import { docsHead } from '../core/features/docs/head'
import { loadDocsPage } from '../core/features/docs/load'

/** One documentation page, rendered at build time from the Markdown file docs/site.json lists for its slug. */
export const Route = createFileRoute('/docs/$slug')({
  loader: ({ params }) => loadDocsPage(params.slug),
  head: ({ loaderData }) => docsHead(loaderData?.page),
  component: editorLeaf(DocsArticlePage),
})
function DocsArticlePage() {
  return <DocsPage {...Route.useLoaderData()} />
}
