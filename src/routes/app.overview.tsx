import {editorLeaf} from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { PortfolioOverviewPage } from '../core/features/portfolio/ui'
export const Route = createFileRoute('/app/overview')({ loader: () => loadDocumentData({ data: ['/api/portfolio'] }), component: editorLeaf(Page) })
function Page() {
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><PortfolioOverviewPage /></DocumentDataContext>
}
