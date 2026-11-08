import { createFileRoute } from '@tanstack/react-router'
import { editorLeaf } from '../core/features/editor/leaf'
import { DocsPage } from '../core/features/docs/DocsPage'
import { docsHead } from '../core/features/docs/head'
import { loadDocsPage } from '../core/features/docs/load'
import { loadDocsSession } from '../core/features/docs/session'

/** The docs home: docs/overview.md, rendered at build time (docs/site.json lists every page). */
export const Route = createFileRoute('/docs/')({
  loader: async () => ({ ...await loadDocsPage(''), signedIn: await loadDocsSession() }),
  head: ({ loaderData }) => docsHead(loaderData?.page),
  component: editorLeaf(DocsHome),
})
function DocsHome() {
  return <DocsPage {...Route.useLoaderData()} />
}
